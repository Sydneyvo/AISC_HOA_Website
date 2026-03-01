const express = require('express');
const db = require('../db');
const { createClerkClient } = require('@clerk/express');
const { recalcScore } = require('../services/scoring');

const router = express.Router();
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function getEmailFromReq(req) {
  const user = await clerkClient.users.getUser(req.auth.userId);
  return (
    user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ||
    user.emailAddresses[0]?.emailAddress
  );
}

// GET /api/tenant/me
// Returns { role: 'tenant', property, violations, bills } or { role: 'admin' }
router.get('/me', async (req, res) => {
  try {
    const email = await getEmailFromReq(req);

    const { rows } = await db.query(
      `SELECT
         p.*,
         COALESCE(json_agg(DISTINCT jsonb_build_object(
           'id',             v.id,
           'property_id',    v.property_id,
           'category',       v.category,
           'severity',       v.severity,
           'description',    v.description,
           'rule_cited',     v.rule_cited,
           'remediation',    v.remediation,
           'deadline_days',  v.deadline_days,
           'status',         v.status,
           'image_url',      v.image_url,
           'fine_amount',    v.fine_amount,
           'notice_sent_at', v.notice_sent_at,
           'resolved_at',    v.resolved_at,
           'created_at',     v.created_at
         )) FILTER (WHERE v.id IS NOT NULL), '[]') AS violations,
         COALESCE(json_agg(DISTINCT jsonb_build_object(
           'id',              b.id,
           'property_id',     b.property_id,
           'billing_month',   b.billing_month,
           'base_amount',     b.base_amount,
           'violation_fines', b.violation_fines,
           'total_amount',    b.total_amount,
           'due_date',        b.due_date,
           'status',          b.status,
           'paid_at',         b.paid_at
         )) FILTER (WHERE b.id IS NOT NULL), '[]') AS bills
       FROM properties p
       LEFT JOIN violations v ON v.property_id = p.id
       LEFT JOIN monthly_bills b ON b.property_id = p.id
       WHERE p.owner_email = $1
       GROUP BY p.id`,
      [email]
    );

    if (!rows.length) return res.json({ role: 'admin' });

    const property = rows[0];
    // Sort violations newest first, bills newest first
    property.violations = (property.violations || []).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    property.bills = (property.bills || []).sort(
      (a, b) => new Date(b.billing_month) - new Date(a.billing_month)
    );

    res.json({ role: 'tenant', property, violations: property.violations, bills: property.bills });
  } catch (err) {
    console.error('Tenant me error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tenant/violations/:id/flag-fixed
// Tenant marks their violation as pending_review
router.patch('/violations/:id/flag-fixed', async (req, res) => {
  try {
    const email = await getEmailFromReq(req);

    const { rows: propRows } = await db.query(
      `SELECT id FROM properties WHERE owner_email = $1`, [email]
    );
    if (!propRows.length) return res.status(403).json({ error: 'No property found for this user' });
    const propertyId = propRows[0].id;

    const { rows } = await db.query(
      `UPDATE violations SET status = 'pending_review'
       WHERE id = $1 AND property_id = $2 AND status = 'open'
       RETURNING *`,
      [req.params.id, propertyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Violation not found or already actioned' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tenant/bills/:id/pay
// Tenant pays their own bill (simulated)
router.patch('/bills/:id/pay', async (req, res) => {
  try {
    const email = await getEmailFromReq(req);

    const { rows: propRows } = await db.query(
      `SELECT id FROM properties WHERE owner_email = $1`, [email]
    );
    if (!propRows.length) return res.status(403).json({ error: 'No property found for this user' });
    const propertyId = propRows[0].id;

    const { rows } = await db.query(
      `UPDATE monthly_bills SET status = 'paid', paid_at = NOW()
       WHERE id = $1 AND property_id = $2
       RETURNING *`,
      [req.params.id, propertyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
    await recalcScore(propertyId);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
