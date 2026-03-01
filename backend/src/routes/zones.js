const express = require('express');
const db      = require('../db');
const router  = express.Router();

// GET /api/zones
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM zones ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/zones  { name, color, geojson }
router.post('/', async (req, res) => {
  try {
    const { name, color, geojson } = req.body;
    if (!name || !geojson) return res.status(400).json({ error: 'name and geojson required' });
    const { rows } = await db.query(
      `INSERT INTO zones (name, color, geojson) VALUES ($1, $2, $3) RETURNING *`,
      [name, color || '#3B82F6', JSON.stringify(geojson)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/zones/:id  { name?, color?, geojson? }
router.put('/:id', async (req, res) => {
  try {
    const { name, color, geojson } = req.body;
    const sets   = [];
    const values = [];
    let   idx    = 1;
    if (name    !== undefined) { sets.push(`name    = $${idx++}`); values.push(name); }
    if (color   !== undefined) { sets.push(`color   = $${idx++}`); values.push(color); }
    if (geojson !== undefined) { sets.push(`geojson = $${idx++}`); values.push(JSON.stringify(geojson)); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE zones SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Zone not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/zones/:id
router.delete('/:id', async (req, res) => {
  try {
    // ON DELETE SET NULL handles zone_id FK on properties + community_posts
    await db.query('DELETE FROM zones WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
