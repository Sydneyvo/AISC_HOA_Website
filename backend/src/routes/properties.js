const express = require('express');
const multer  = require('multer');
const db      = require('../db');
const { uploadToBlob, deleteBlob } = require('../services/azure');
const { extractPdfText, hashFile } = require('../services/pdf');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/properties
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*,
             z.name  AS zone_name,
             z.color AS zone_color,
             COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations,
             MAX(v.created_at) AS last_activity,
             COALESCE(
               (SELECT SUM(b.total_amount)
                FROM monthly_bills b
                WHERE b.property_id = p.id AND b.status != 'paid'), 0
             ) AS total_owed,
             COALESCE(
               (SELECT COUNT(*) FROM monthly_bills b
                WHERE b.property_id = p.id AND b.status = 'overdue'), 0
             ) AS overdue_bills
      FROM properties p
      LEFT JOIN zones z ON z.id = p.zone_id
      LEFT JOIN violations v ON v.property_id = p.id
      GROUP BY p.id, z.name, z.color
      ORDER BY p.combined_score ASC NULLS LAST
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/properties/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows: propRows } = await db.query(
      `SELECT * FROM properties WHERE id = $1`, [req.params.id]
    );
    if (!propRows.length) return res.status(404).json({ error: 'Property not found' });

    const { rows: violations } = await db.query(
      `SELECT * FROM violations WHERE property_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    const { rows: bills } = await db.query(
      `SELECT * FROM monthly_bills WHERE property_id = $1 ORDER BY billing_month DESC`,
      [req.params.id]
    );

    const overdueCount   = bills.filter(b => b.status === 'overdue').length;
    const financialScore = Math.max(0, 100 - overdueCount * 25);

    res.json({ ...propRows[0], violations, bills, financial_score: financialScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/properties
router.post('/', async (req, res) => {
  try {
    const { address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, latitude, longitude, zone_id } = req.body;
    const { rows } = await db.query(
      `INSERT INTO properties
         (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, combined_score, latitude, longitude, zone_id)
       VALUES ($1, $2, $3, $4, $5, $6, 100, $7, $8, $9) RETURNING *`,
      [address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft || null,
       latitude || null, longitude || null, zone_id || null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/properties/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT rules_pdf_url FROM properties WHERE id = $1`, [req.params.id]
    );
    if (rows[0]?.rules_pdf_url) {
      await deleteBlob(rows[0].rules_pdf_url, 'documentscont');
    }
    await db.query(`DELETE FROM properties WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/properties/:id/rules-pdf
router.post('/:id/rules-pdf', upload.single('file'), async (req, res) => {
  try {
    const propertyId = req.params.id;
    const newBuffer  = req.file.buffer;
    const newHash    = hashFile(newBuffer);

    const { rows } = await db.query(
      `SELECT rules_pdf_url, rules_pdf_hash FROM properties WHERE id = $1`, [propertyId]
    );
    const current = rows[0];

    if (current.rules_pdf_hash && current.rules_pdf_hash === newHash) {
      return res.json({
        success: true, changed: false,
        message: 'PDF is identical to the current version — no update needed.'
      });
    }

    if (current.rules_pdf_url) {
      await deleteBlob(current.rules_pdf_url, 'documentscont');
    }

    const newPdfUrl    = await uploadToBlob(newBuffer, req.file.originalname, 'documentscont');
    const newRulesText = await extractPdfText(newBuffer);

    await db.query(
      `UPDATE properties
       SET rules_pdf_url = $1, rules_text = $2, rules_pdf_hash = $3, rules_pdf_updated_at = NOW()
       WHERE id = $4`,
      [newPdfUrl, newRulesText, newHash, propertyId]
    );

    res.json({ success: true, changed: true, pdf_url: newPdfUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
