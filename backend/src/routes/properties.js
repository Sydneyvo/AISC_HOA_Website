const express = require('express');
const multer  = require('multer');
const db      = require('../db');
const { uploadToBlob, deleteBlob } = require('../services/azure');
const { extractPdfText, hashFile } = require('../services/pdf');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/properties
// All properties with open violation count, sorted by compliance score ascending
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*,
             COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations,
             MAX(v.created_at) AS last_activity
      FROM properties p
      LEFT JOIN violations v ON v.property_id = p.id
      GROUP BY p.id
      ORDER BY p.compliance_score ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/properties/:id
// Single property + all its violations
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
    res.json({ ...propRows[0], violations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/properties
// Create a new property
router.post('/', async (req, res) => {
  try {
    const { address, owner_name, owner_email, owner_phone, resident_since } = req.body;
    const { rows } = await db.query(
      `INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [address, owner_name, owner_email, owner_phone, resident_since]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/properties/:id
// Delete property + clean up its rules PDF blob (violations cascade via DB)
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT rules_pdf_url FROM properties WHERE id = $1`, [req.params.id]
    );
    if (rows[0]?.rules_pdf_url) {
      await deleteBlob(rows[0].rules_pdf_url, 'documents');
    }
    await db.query(`DELETE FROM properties WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/properties/:id/rules-pdf
// Upload or replace HOA rules PDF — extracts text once, stores it for AI use
router.post('/:id/rules-pdf', upload.single('file'), async (req, res) => {
  try {
    const propertyId = req.params.id;
    const newBuffer  = req.file.buffer;
    const newHash    = hashFile(newBuffer);

    // Check what's currently stored
    const { rows } = await db.query(
      `SELECT rules_pdf_url, rules_pdf_hash FROM properties WHERE id = $1`, [propertyId]
    );
    const current = rows[0];

    // Same file re-uploaded? Do nothing.
    if (current.rules_pdf_hash && current.rules_pdf_hash === newHash) {
      return res.json({
        success: true,
        changed: false,
        message: 'PDF is identical to the current version — no update needed.'
      });
    }

    // Different file: delete the old blob from Azure (if one exists)
    if (current.rules_pdf_url) {
      await deleteBlob(current.rules_pdf_url, 'documents');
    }

    // Upload new PDF to Azure Blob
    const newPdfUrl = await uploadToBlob(newBuffer, req.file.originalname, 'documents');

    // Extract text from the new PDF (done once here, stored in DB)
    const newRulesText = await extractPdfText(newBuffer);

    // Persist everything to DB
    await db.query(
      `UPDATE properties
       SET rules_pdf_url        = $1,
           rules_text           = $2,
           rules_pdf_hash       = $3,
           rules_pdf_updated_at = NOW()
       WHERE id = $4`,
      [newPdfUrl, newRulesText, newHash, propertyId]
    );

    res.json({ success: true, changed: true, pdf_url: newPdfUrl });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
