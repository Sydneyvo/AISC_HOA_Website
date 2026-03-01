const express  = require('express');
const multer   = require('multer');
const db       = require('../db');
const { uploadToBlob }                        = require('../services/azure');
const { analyzeViolation, DEFAULT_HOA_RULES } = require('../services/claude');
const { sendViolationNotice }                 = require('../services/email');
const { recalcScore, calcFineAmount }         = require('../services/scoring');
const { ensureCurrentBill }                   = require('./bills');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/violations/analyze
router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const { property_id, hint } = req.body;

    const image_url = await uploadToBlob(req.file.buffer, req.file.originalname, 'violationscont');

    const propResult = await db.query(
      `SELECT rules_text, combined_score FROM properties WHERE id = $1`, [property_id]
    );
    const hoaRulesText          = propResult.rows[0]?.rules_text || DEFAULT_HOA_RULES;
    const propertyCombinedScore = propResult.rows[0]?.combined_score ?? 100;

    const analysis = await analyzeViolation(req.file.buffer, req.file.mimetype, hoaRulesText, hint || '');

    res.json({ image_url, property_combined_score: propertyCombinedScore, ...analysis });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

// POST /api/violations
router.post('/', async (req, res) => {
  try {
    const {
      property_id, image_url, category, severity,
      description, rule_cited, remediation, deadline_days,
      send_email
    } = req.body;

    // Fetch current combined_score to determine fine multiplier
    const { rows: propRows } = await db.query(
      `SELECT combined_score FROM properties WHERE id = $1`, [property_id]
    );
    const combinedScore = propRows[0]?.combined_score ?? 100;
    const fineAmount    = calcFineAmount(severity, combinedScore);

    const { rows } = await db.query(
      `INSERT INTO violations
         (property_id, image_url, category, severity, description, rule_cited, remediation, deadline_days, fine_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [property_id, image_url, category, severity, description, rule_cited, remediation, deadline_days, fineAmount]
    );
    const violation = rows[0];

    // Recalc scores then refresh the current month's bill
    await recalcScore(property_id);
    const bill = await ensureCurrentBill(property_id);

    if (send_email) {
      try {
        const { rows: updatedPropRows } = await db.query(
          `SELECT * FROM properties WHERE id = $1`, [property_id]
        );
        await sendViolationNotice({ property: updatedPropRows[0], violation, bill });
        await db.query(`UPDATE violations SET notice_sent_at = NOW() WHERE id = $1`, [violation.id]);
        violation.notice_sent_at = new Date();
      } catch (emailErr) {
        console.error('Email send failed (violation saved):', emailErr.message);
        violation.email_error = emailErr.message;
      }
    }

    res.json(violation);
  } catch (err) {
    console.error('Save violation error:', err);
    res.status(500).json({ error: 'Failed to save violation', details: err.message });
  }
});

// GET /api/violations — global search across all properties
router.get('/', async (req, res) => {
  try {
    const { search, category, severity, status } = req.query;
    const conditions = [];
    const params     = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      const n = params.length;
      conditions.push(`(LOWER(v.description) LIKE $${n} OR LOWER(p.address) LIKE $${n} OR LOWER(p.owner_name) LIKE $${n})`);
    }
    if (category) { params.push(category); conditions.push(`v.category = $${params.length}`); }
    if (severity) { params.push(severity); conditions.push(`v.severity = $${params.length}`); }
    if (status)   { params.push(status);   conditions.push(`v.status   = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT v.*, p.address, p.owner_name
       FROM violations v
       JOIN properties p ON p.id = v.property_id
       ${where}
       ORDER BY v.created_at DESC
       LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/violations/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM violations WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Violation not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/violations/:id
router.patch('/:id', async (req, res) => {
  try {
    const { category, severity, description, rule_cited, remediation, deadline_days, send_email } = req.body;

    const { rows } = await db.query(
      `UPDATE violations
       SET category = $1, severity = $2, description = $3,
           rule_cited = $4, remediation = $5, deadline_days = $6
       WHERE id = $7 RETURNING *`,
      [category, severity, description, rule_cited, remediation, deadline_days, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Violation not found' });
    const violation = rows[0];

    await recalcScore(violation.property_id);
    const bill = await ensureCurrentBill(violation.property_id);

    if (send_email) {
      try {
        const propResult = await db.query(`SELECT * FROM properties WHERE id = $1`, [violation.property_id]);
        await sendViolationNotice({ property: propResult.rows[0], violation, bill });
        await db.query(`UPDATE violations SET notice_sent_at = NOW() WHERE id = $1`, [violation.id]);
        violation.notice_sent_at = new Date();
      } catch (emailErr) {
        console.error('Email send failed:', emailErr.message);
        violation.email_error = emailErr.message;
      }
    }

    res.json(violation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/violations/:id/resolve
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE violations SET status = 'resolved', resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Violation not found' });

    await recalcScore(rows[0].property_id);
    await ensureCurrentBill(rows[0].property_id);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/violations/:id/reopen
router.patch('/:id/reopen', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE violations SET status = 'open' WHERE id = $1 AND status = 'pending_review' RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Violation not found or not pending review' });
    await recalcScore(rows[0].property_id);
    await ensureCurrentBill(rows[0].property_id);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
