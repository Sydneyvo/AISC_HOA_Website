const express  = require('express');
const multer   = require('multer');
const db       = require('../db');
const { uploadToBlob }                        = require('../services/azure');
const { analyzeViolation, DEFAULT_HOA_RULES } = require('../services/claude');
const { sendViolationNotice }                 = require('../services/email');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/violations/analyze
// Receives image → uploads to Azure → calls Claude → returns analysis + image_url
router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const { property_id, hint } = req.body;
    const fileBuffer = req.file.buffer;
    const mimeType   = req.file.mimetype;

    // 1. Upload violation photo to Azure Blob
    const image_url = await uploadToBlob(fileBuffer, req.file.originalname, 'violations');

    // 2. Get this property's rules text (already extracted at PDF upload time)
    const propResult = await db.query(
      `SELECT rules_text FROM properties WHERE id = $1`, [property_id]
    );
    const hoaRulesText = propResult.rows[0]?.rules_text || DEFAULT_HOA_RULES;

    // 3. Call Claude with image + rules text
    const analysis = await analyzeViolation(fileBuffer, mimeType, hoaRulesText, hint || '');

    res.json({ image_url, ...analysis });

  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

// POST /api/violations
// Save the reviewed violation to DB + optionally send email
router.post('/', async (req, res) => {
  try {
    const {
      property_id, image_url, category, severity,
      description, rule_cited, remediation, deadline_days,
      send_email
    } = req.body;

    // 1. Save violation to DB
    const { rows } = await db.query(
      `INSERT INTO violations
         (property_id, image_url, category, severity, description, rule_cited, remediation, deadline_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [property_id, image_url, category, severity, description, rule_cited, remediation, deadline_days]
    );
    const violation = rows[0];

    // 2. Send email if requested
    if (send_email) {
      const propResult = await db.query(`SELECT * FROM properties WHERE id = $1`, [property_id]);
      const property   = propResult.rows[0];
      await sendViolationNotice({ property, violation });
      await db.query(
        `UPDATE violations SET notice_sent_at = NOW() WHERE id = $1`, [violation.id]
      );
      violation.notice_sent_at = new Date();
    }

    // 3. Recalculate compliance score
    await recalculateScore(property_id);

    res.json(violation);

  } catch (err) {
    console.error('Save violation error:', err);
    res.status(500).json({ error: 'Failed to save violation', details: err.message });
  }
});

// PATCH /api/violations/:id/resolve
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE violations SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Violation not found' });

    await recalculateScore(rows[0].property_id);
    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recalculate and persist compliance score for a property
// Called after every new violation and every resolve
async function recalculateScore(propertyId) {
  const result = await db.query(
    `SELECT severity FROM violations WHERE property_id = $1 AND status = 'open'`,
    [propertyId]
  );

  const deductions = result.rows.reduce((total, v) => {
    if (v.severity === 'high')   return total + 20;
    if (v.severity === 'medium') return total + 10;
    if (v.severity === 'low')    return total + 5;
    return total;
  }, 0);

  const newScore = Math.max(0, 100 - deductions);

  await db.query(
    `UPDATE properties SET compliance_score = $1 WHERE id = $2`,
    [newScore, propertyId]
  );

  return newScore;
}

module.exports = router;
