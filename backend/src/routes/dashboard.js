const express = require('express');
const db      = require('../db');

const router = express.Router();

// GET /api/dashboard/violations-timeline
// All violations across all properties — powers the community scatter chart
router.get('/violations-timeline', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT v.id,
             v.created_at,
             v.severity,
             v.category,
             v.status,
             p.address AS property_address
      FROM violations v
      JOIN properties p ON p.id = v.property_id
      ORDER BY v.created_at ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
