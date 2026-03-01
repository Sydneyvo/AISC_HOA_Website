const express = require('express');
const db      = require('../db');
const { recalcScore }     = require('../services/scoring');
const { sendOverdueReminder } = require('../services/email');

const router = express.Router();

const BASE_RATE = 0.05; // $ per sqft per month

// Returns the first day of the current month as a YYYY-MM-DD string
function currentBillingMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1))
    .toISOString()
    .split('T')[0];
}

// Create or refresh the current month's bill for a property.
// Frozen (paid/overdue) bills are never modified.
async function ensureCurrentBill(propertyId) {
  const monthStr = currentBillingMonth();

  const { rows: propRows } = await db.query(
    `SELECT land_area_sqft FROM properties WHERE id = $1`, [propertyId]
  );
  const landArea   = parseFloat(propRows[0]?.land_area_sqft ?? 0);
  const baseAmount = parseFloat((landArea * BASE_RATE).toFixed(2));

  // Sum fine_amount for open violations created in the current calendar month
  const { rows: fineRows } = await db.query(
    `SELECT COALESCE(SUM(fine_amount), 0) AS total
     FROM violations
     WHERE property_id = $1
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
       AND status = 'open'`,
    [propertyId]
  );
  const violationFines = parseFloat(fineRows[0].total);
  const totalAmount    = parseFloat((baseAmount + violationFines).toFixed(2));

  // Due on the 15th of the billing month
  const [yr, mo] = monthStr.split('-').map(Number);
  const dueDateStr = `${yr}-${String(mo).padStart(2, '0')}-15`;

  await db.query(
    `INSERT INTO monthly_bills
       (property_id, billing_month, base_amount, violation_fines, total_amount, due_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     ON CONFLICT (property_id, billing_month)
     DO UPDATE SET
       violation_fines = EXCLUDED.violation_fines,
       total_amount    = EXCLUDED.total_amount
     WHERE monthly_bills.status = 'pending'`,
    [propertyId, monthStr, baseAmount, violationFines, totalAmount, dueDateStr]
  );

  const { rows } = await db.query(
    `SELECT * FROM monthly_bills WHERE property_id = $1 AND billing_month = $2`,
    [propertyId, monthStr]
  );
  return rows[0];
}

// Hourly job: mark overdue bills, send reminder emails, recalc scores
async function checkOverdueBills() {
  try {
    const { rows } = await db.query(`
      SELECT b.*, p.owner_email, p.owner_name, p.address
      FROM monthly_bills b
      JOIN properties p ON p.id = b.property_id
      WHERE b.status = 'pending'
        AND b.due_date < NOW()
        AND b.reminder_sent_at IS NULL
    `);

    for (const bill of rows) {
      await db.query(
        `UPDATE monthly_bills SET status = 'overdue', reminder_sent_at = NOW() WHERE id = $1`,
        [bill.id]
      );
      await recalcScore(bill.property_id);
      try {
        await sendOverdueReminder({
          bill,
          property: {
            owner_email: bill.owner_email,
            owner_name:  bill.owner_name,
            address:     bill.address,
          }
        });
      } catch (emailErr) {
        console.error('Overdue reminder email failed:', emailErr.message);
      }
    }
  } catch (err) {
    console.error('Overdue check error:', err.message);
  }
}

// GET /api/finance
// All properties with unpaid bills + community totals
router.get('/', async (req, res) => {
  try {
    const { rows: props } = await db.query(`SELECT id FROM properties`);
    await Promise.all(props.map(p => ensureCurrentBill(p.id)));

    const { rows } = await db.query(`
      SELECT
        p.id, p.address, p.owner_name, p.owner_email,
        p.compliance_score, p.combined_score,
        COALESCE(SUM(b.total_amount) FILTER (WHERE b.status != 'paid'), 0) AS total_owed,
        COUNT(b.id)          FILTER (WHERE b.status = 'overdue')           AS overdue_count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id',             b.id,
            'billing_month',  b.billing_month,
            'base_amount',    b.base_amount,
            'violation_fines',b.violation_fines,
            'total_amount',   b.total_amount,
            'due_date',       b.due_date,
            'status',         b.status,
            'paid_at',        b.paid_at
          ) ORDER BY b.billing_month DESC
        ) FILTER (WHERE b.id IS NOT NULL) AS bills
      FROM properties p
      LEFT JOIN monthly_bills b ON b.property_id = p.id
      GROUP BY p.id
      ORDER BY total_owed DESC
    `);

    const communityTotalOwed = rows.reduce(
      (sum, r) => sum + parseFloat(r.total_owed ?? 0), 0
    );
    const overdueCount = rows.reduce(
      (sum, r) => sum + parseInt(r.overdue_count ?? 0), 0
    );

    res.json({
      community_total_owed: parseFloat(communityTotalOwed.toFixed(2)),
      overdue_count:        overdueCount,
      properties:           rows.filter(r => parseFloat(r.total_owed) > 0),
      all_properties:       rows,
    });
  } catch (err) {
    console.error('Finance load error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/property/:id
// Bills for a single property
router.get('/property/:id', async (req, res) => {
  try {
    await ensureCurrentBill(req.params.id);
    const { rows } = await db.query(
      `SELECT * FROM monthly_bills WHERE property_id = $1 ORDER BY billing_month DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/finance/:id/pay
router.patch('/:id/pay', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE monthly_bills SET status = 'paid', paid_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
    await recalcScore(rows[0].property_id);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.ensureCurrentBill = ensureCurrentBill;
module.exports.checkOverdueBills = checkOverdueBills;
