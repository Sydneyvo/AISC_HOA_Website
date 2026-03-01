const db = require('../db');

const FINE_BASE = { low: 50, medium: 100, high: 200 };

function getFineMultiplier(combinedScore) {
  if (combinedScore >= 80) return 1.0;
  if (combinedScore >= 60) return 1.25;
  if (combinedScore >= 40) return 1.5;
  return 2.0;
}

function calcFineAmount(severity, combinedScore) {
  const base = FINE_BASE[severity] ?? 50;
  const mult = getFineMultiplier(combinedScore);
  return parseFloat((base * mult).toFixed(2));
}

async function recalcScore(propertyId) {
  // 1. Time-weighted compliance score: recent violations hurt more than old ones
  const { rows: openViolations } = await db.query(
    `SELECT severity, created_at FROM violations WHERE property_id = $1 AND status = 'open'`,
    [propertyId]
  );

  const now = Date.now();
  const deductions = openViolations.reduce((total, v) => {
    const ageDays = (now - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const weight  = Math.max(0.3, 1 - ageDays / 180); // full weight today, min 0.3 at 180+ days
    const base    = v.severity === 'high' ? 20 : v.severity === 'medium' ? 10 : 5;
    return total + base * weight;
  }, 0);
  const complianceScore = Math.max(0, Math.round(100 - deductions));

  // 2. Financial score: each overdue month costs 25 points
  const { rows: overdueRows } = await db.query(
    `SELECT COUNT(*) AS cnt FROM monthly_bills WHERE property_id = $1 AND status = 'overdue'`,
    [propertyId]
  );
  const overdueMonths  = parseInt(overdueRows[0].cnt, 10);
  const financialScore = Math.max(0, 100 - overdueMonths * 25);

  // 3. Combined: 60% compliance, 40% financial
  const combinedScore = Math.round(complianceScore * 0.6 + financialScore * 0.4);

  await db.query(
    `UPDATE properties SET compliance_score = $1, combined_score = $2 WHERE id = $3`,
    [complianceScore, combinedScore, propertyId]
  );

  return { complianceScore, financialScore, combinedScore };
}

module.exports = { recalcScore, calcFineAmount, getFineMultiplier };
