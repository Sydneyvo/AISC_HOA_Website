# Finance & Scoring Enhancements Design
**Date:** 2026-02-28 | **Status:** Approved

## Features

1. Monthly billing (base fee by land area + violation surcharges)
2. Overdue payment reminder emails
3. Time-weighted compliance score
4. Financial score
5. Combined score (compliance + financial)
6. Dynamic violation fines based on combined score
7. Finance dashboard tab
8. Billing history on property detail

## Architecture

Approach A — compute-on-demand. All scores and totals are recalculated server-side on every
relevant API call. Monthly bill rows are generated idempotently when the finance tab loads.
Overdue reminders run via a `setInterval` check every hour in the Express process.

---

## Data Model

### `properties` table — 2 new columns
```sql
land_area_sqft   NUMERIC(10,2)   -- e.g. 5400.00
combined_score   INTEGER          -- 0–100, stored after each recalc
```

### New table: `monthly_bills`
```sql
id               SERIAL PRIMARY KEY
property_id      INTEGER REFERENCES properties(id) ON DELETE CASCADE
billing_month    DATE               -- always 1st of month, e.g. 2026-02-01
base_amount      NUMERIC(10,2)      -- land_area_sqft * 0.05 at generation time
violation_fines  NUMERIC(10,2)      -- sum of fine_amount for open violations that month
total_amount     NUMERIC(10,2)      -- base_amount + violation_fines
due_date         DATE               -- billing_month + 15 days
status           VARCHAR(10)        -- 'pending' | 'paid' | 'overdue'
paid_at          TIMESTAMPTZ
reminder_sent_at TIMESTAMPTZ        -- null = no reminder sent yet
created_at       TIMESTAMPTZ DEFAULT NOW()
```

### `violations` table — 1 new column
```sql
fine_amount      NUMERIC(10,2)   -- locked in at save time based on combined_score
```

**Base fee rate:** `$0.05 / sqft / month` — constant in backend config.

---

## Score Formulas

### Time-weighted compliance score
```
age_days = days since violation created_at
weight   = max(0.3, 1 - age_days / 180)

severity_base: high=20, medium=10, low=5
deduction = severity_base * weight  (open violations only)

compliance_score = max(0, 100 - sum(all open violation deductions))
```

### Financial score
```
overdue_months  = COUNT of monthly_bills WHERE status = 'overdue'
financial_score = max(0, 100 - overdue_months * 25)
```

### Combined score
```
combined_score = round(compliance_score * 0.6 + financial_score * 0.4)
```
Stored in `properties.combined_score`. Recalculated on: violation save, violation resolve,
bill marked paid, bill marked overdue. All via a shared `recalcScore(property_id)` helper.

---

## Fee Calculation

Violation `fine_amount` is calculated at save time using the current `combined_score`.
It is locked and never retroactively changed.

| Combined Score | Multiplier | Low   | Medium | High   |
|----------------|-----------|-------|--------|--------|
| 80–100         | 1.0×      | $50   | $100   | $200   |
| 60–79          | 1.25×     | $62   | $125   | $250   |
| 40–59          | 1.5×      | $75   | $150   | $300   |
| 0–39           | 2.0×      | $100  | $200   | $400   |

---

## Monthly Billing Logic

**Bill generation** (idempotent, triggered when finance tab loads):
```
For each property:
  If no bill exists for current month:
    base_amount     = land_area_sqft * 0.05
    violation_fines = SUM(fine_amount) for open violations created this month
    total_amount    = base_amount + violation_fines
    due_date        = first day of month + 15 days
    status          = 'pending'
    INSERT INTO monthly_bills ...
```

**Overdue transition** (hourly setInterval in Express):
```
UPDATE monthly_bills SET status = 'overdue'
WHERE status = 'pending' AND due_date < NOW() AND reminder_sent_at IS NULL
→ send overdue reminder email
→ set reminder_sent_at = NOW()
→ recalcScore() for each affected property
```

**Mark paid** — `PATCH /api/bills/:id/pay`:
```
SET paid_at = NOW(), status = 'paid'
→ recalcScore(property_id)
```

---

## New API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance` | All properties with unpaid/overdue bills + community totals |
| GET | `/api/properties/:id/bills` | All monthly bills for a property |
| PATCH | `/api/bills/:id/pay` | Mark a bill as paid |
| POST | `/api/bills/generate` | Manually trigger bill generation (also auto on finance load) |

---

## Frontend Changes

### Dashboard
- Tab switcher: **Properties** | **Finance**
- Finance tab:
  - Summary bar: total owed community-wide, count of overdue bills
  - Table: Address · Owner · Month · Base · Fines · Total · Due Date · Status · Mark Paid

### Property Detail
- Score ring now shows `combined_score` (was `compliance_score`)
- Sub-label: "Compliance 85 · Finance 75"
- New **Billing History** section below violations table:
  - Month · Base · Fines · Total · Due Date · Status · Mark Paid button

### Add Property form
- New required field: **Land Area (sq ft)**

---

## Email Changes

### Violation notice (existing) — add finance block:
```
Fine for this violation: $200.00
Your current monthly bill: $470.00 (due Feb 15)
Combined property score: 72
```

### Overdue reminder (new template):
```
Subject: Payment Overdue — [address]
Your [Month] bill of $[amount] was due [date] and remains unpaid.
Your property score has been updated to reflect this.
Please contact the HOA to arrange payment.
```
Sent once per bill (guarded by `reminder_sent_at`).

---

## Files Affected

### Backend
- Modify: `backend/src/db/schema.sql` — new columns + monthly_bills table
- Create: `backend/src/services/scoring.js` — `recalcScore(property_id)` helper
- Modify: `backend/src/routes/violations.js` — compute fine_amount on save; call recalcScore
- Modify: `backend/src/routes/properties.js` — add land_area_sqft to create/update
- Create: `backend/src/routes/bills.js` — finance routes
- Modify: `backend/src/index.js` — register bills router + start hourly overdue check
- Modify: `backend/src/services/email.js` — add overdue reminder template + update violation notice

### Frontend
- Modify: `frontend/src/pages/Dashboard.jsx` — tab switcher, Finance tab
- Create: `frontend/src/components/FinanceTable.jsx` — community finance view
- Modify: `frontend/src/pages/PropertyDetail.jsx` — combined score, billing section
- Modify: `frontend/src/api.js` — new finance API calls
