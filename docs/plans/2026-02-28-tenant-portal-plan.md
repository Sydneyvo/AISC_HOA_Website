# Tenant Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a self-service tenant portal so homeowners can sign in with Clerk, see their property status, flag violations as fixed, and pay monthly bills.

**Architecture:** After Clerk sign-in, `App.jsx` calls `GET /api/tenant/me` to look up the logged-in user's email against `properties.owner_email`. If a match is found, the tenant portal is rendered; otherwise the admin dashboard renders. No new login pages needed. A new `pending_review` violation status bridges the tenant "I've fixed this" action and the admin confirm/reject step.

**Tech Stack:** `@clerk/express` (already installed), React 18, Express.js, PostgreSQL

---

### Task 1: DB migration — add `pending_review` status

**Files:**
- Modify: `backend/src/db/migrate.sql`

**Context:** `migrate.sql` is run on every backend startup via `db.query(migrationSql)` in `index.js`. It uses `IF NOT EXISTS` / `IF EXISTS` guards so it's safe to run multiple times. The violations table currently has a CHECK constraint named `violations_status_check` allowing only `'open'` and `'resolved'`. We need to add `'pending_review'`.

**Step 1: Append migration to `backend/src/db/migrate.sql`**

Add to the end of the file:

```sql
-- Migration: add pending_review violation status
ALTER TABLE violations DROP CONSTRAINT IF EXISTS violations_status_check;
ALTER TABLE violations ADD CONSTRAINT violations_status_check
  CHECK (status IN ('open', 'pending_review', 'resolved'));
```

**Step 2: Restart backend and verify the migration runs**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/backend && npm run dev
```

Expected in console: `DB migration applied`

**Step 3: Verify the constraint by running a quick DB query (optional manual check)**

```bash
curl http://localhost:3001/health
```

Expected: `{"ok":true}`

**Step 4: Commit**

```bash
git add backend/src/db/migrate.sql
git commit -m "feat: add pending_review to violations status constraint"
```

---

### Task 2: Create backend tenant routes

**Files:**
- Create: `backend/src/routes/tenant.js`
- Modify: `backend/src/index.js`

**Context:** `@clerk/express` is already installed. `createClerkClient` lets us look up a user's email by their Clerk `userId`. `req.auth.userId` is populated by the existing `clerkMiddleware()`. All routes under `/api/tenant` will be protected by `requireAuth()` (added in `index.js`). The `recalcScore` helper is already used in `bills.js` and `violations.js`.

**Step 1: Create `backend/src/routes/tenant.js`**

```js
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
```

**Step 2: Register route in `backend/src/index.js`**

Add after the existing `/api/finance` line:

```js
app.use('/api/tenant',     requireAuth(), require('./routes/tenant'));
```

The full routes block becomes:

```js
// Routes — all protected by Clerk
app.use('/api/properties', requireAuth(), require('./routes/properties'));
app.use('/api/violations', requireAuth(), require('./routes/violations'));
app.use('/api/dashboard',  requireAuth(), require('./routes/dashboard'));
app.use('/api/finance',    requireAuth(), require('./routes/bills'));
app.use('/api/tenant',     requireAuth(), require('./routes/tenant'));
```

**Step 3: Restart backend and verify**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/backend && npm run dev
```

Expected: server starts, no errors.

```bash
curl http://localhost:3001/api/tenant/me
```

Expected: `401` (no auth token — route is protected).

**Step 4: Commit**

```bash
git add backend/src/routes/tenant.js backend/src/index.js
git commit -m "feat: add tenant routes (me, flag-fixed, pay bill)"
```

---

### Task 3: Add violation reopen endpoint

**Files:**
- Modify: `backend/src/routes/violations.js`

**Context:** When a tenant flags a violation as fixed (`pending_review`), the admin can confirm (uses existing `PATCH /:id/resolve`) or reject (reopen). The existing `PATCH /:id` updates violation fields but doesn't update `status`. We need a dedicated reopen endpoint.

**Step 1: Add to `backend/src/routes/violations.js`**

Add after the existing `PATCH /:id/resolve` handler (before `module.exports`):

```js
// PATCH /api/violations/:id/reopen
router.patch('/:id/reopen', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE violations SET status = 'open' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Violation not found' });
    await recalcScore(rows[0].property_id);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Restart backend and verify**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/backend && npm run dev
```

Expected: starts cleanly.

**Step 3: Commit**

```bash
git add backend/src/routes/violations.js
git commit -m "feat: add PATCH /api/violations/:id/reopen endpoint"
```

---

### Task 4: Add tenant API functions to `frontend/src/api.js`

**Files:**
- Modify: `frontend/src/api.js`

**Context:** `api.js` uses the `authHeaders()` + `_getToken` pattern already in place. Add four new exports at the end of the file: `getTenantMe`, `flagViolationFixed`, `tenantPayBill`, `reopenViolation`.

**Step 1: Append to `frontend/src/api.js`**

Add after the last `payBill` export:

```js
// Tenant portal
export const getTenantMe = async () =>
  fetch(`${BASE}/api/tenant/me`, {
    headers: await authHeaders(),
  }).then(json);

export const flagViolationFixed = async (id) =>
  fetch(`${BASE}/api/tenant/violations/${id}/flag-fixed`, {
    method: 'PATCH',
    headers: await authHeaders(),
  }).then(json);

export const tenantPayBill = async (id) =>
  fetch(`${BASE}/api/tenant/bills/${id}/pay`, {
    method: 'PATCH',
    headers: await authHeaders(),
  }).then(json);

export const reopenViolation = async (id) =>
  fetch(`${BASE}/api/violations/${id}/reopen`, {
    method: 'PATCH',
    headers: await authHeaders(),
  }).then(json);
```

**Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add getTenantMe, flagViolationFixed, tenantPayBill, reopenViolation to api.js"
```

---

### Task 5: Update `App.jsx` for role-based routing

**Files:**
- Modify: `frontend/src/App.jsx`

**Context:** Currently `App.jsx` renders admin routes for all signed-in users. After `AuthBridge` sets the token, we call `getTenantMe()` to determine role. While loading: spinner. If `role === 'tenant'`: render `<TenantDashboard>`. If `role === 'admin'`: render existing admin routes. The `AuthBridge` component is updated to accept an `onRoleLoaded` callback.

**Step 1: Rewrite `frontend/src/App.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/clerk-react';
import { setTokenGetter, getTenantMe } from './api';
import Dashboard       from './pages/Dashboard';
import PropertyDetail  from './pages/PropertyDetail';
import ViolationForm   from './pages/ViolationForm';
import ViolationEdit   from './pages/ViolationEdit';
import LoginPage       from './pages/LoginPage';
import TenantDashboard from './pages/TenantDashboard';

// Sets the token getter then immediately resolves the user's role
function AuthBridge({ onRoleLoaded }) {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(getToken);
    getTenantMe().then(onRoleLoaded).catch(() => onRoleLoaded({ role: 'admin' }));
  }, [getToken]);
  return null;
}

export default function App() {
  const [roleData, setRoleData] = useState(null); // null = still loading

  return (
    <>
      <SignedIn>
        <AuthBridge onRoleLoaded={setRoleData} />

        {roleData === null ? (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        ) : roleData.role === 'tenant' ? (
          <TenantDashboard initialData={roleData} />
        ) : (
          <div className="min-h-screen bg-gray-50">
            <nav className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between">
              <a href="/" className="font-bold text-lg hover:opacity-80">HOA Compliance</a>
              <UserButton afterSignOutUrl="/login" />
            </nav>
            <Routes>
              <Route path="/"                                       element={<Dashboard />} />
              <Route path="/properties/:id"                         element={<PropertyDetail />} />
              <Route path="/properties/:id/violations/new"          element={<ViolationForm />} />
              <Route path="/properties/:id/violations/:violId/edit" element={<ViolationEdit />} />
              <Route path="/login"                                  element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        )}
      </SignedIn>

      <SignedOut>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*"      element={<Navigate to="/login" replace />} />
        </Routes>
      </SignedOut>
    </>
  );
}
```

**Step 2: Verify frontend starts**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/frontend && npm run dev
```

Expected: compiles without errors. Visiting http://localhost:5173 and signing in as admin should still show the admin dashboard (no property matches admin email).

**Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: role-based routing in App.jsx — tenant vs admin after sign-in"
```

---

### Task 6: Create `TenantDashboard.jsx`

**Files:**
- Create: `frontend/src/pages/TenantDashboard.jsx`

**Context:** Receives `initialData = { role, property, violations, bills }` as a prop from `App.jsx`. Manages its own `violations` and `bills` state for optimistic updates. Does not use React Router (it's a single-page view with no sub-routes).

**Step 1: Create `frontend/src/pages/TenantDashboard.jsx`**

```jsx
import { useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { flagViolationFixed, tenantPayBill } from '../api';

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high:   'bg-red-100 text-red-800',
};

const BILL_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid:    'bg-green-100 text-green-800',
};

function fmt(amount) {
  return `$${parseFloat(amount ?? 0).toFixed(2)}`;
}

function fmtMonth(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function scoreColor(score) {
  if (score >= 80) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

export default function TenantDashboard({ initialData }) {
  const [violations, setViolations] = useState(initialData.violations || []);
  const [bills, setBills]           = useState(initialData.bills       || []);
  const [flagging, setFlagging]     = useState(null);
  const [paying, setPaying]         = useState(null);

  const property = initialData.property;
  const score    = property.combined_score ?? property.compliance_score;

  const handleFlagFixed = async (violId) => {
    setFlagging(violId);
    try {
      const updated = await flagViolationFixed(violId);
      setViolations(vs => vs.map(v => v.id === violId ? updated : v));
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setFlagging(null);
    }
  };

  const handlePayBill = async (billId) => {
    setPaying(billId);
    try {
      const updated = await tenantPayBill(billId);
      setBills(bs => bs.map(b => b.id === billId ? updated : b));
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setPaying(null);
    }
  };

  const openViolations    = violations.filter(v => v.status === 'open');
  const pendingViolations = violations.filter(v => v.status === 'pending_review');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between">
        <span className="font-bold text-lg">HOA Compliance — My Property</span>
        <UserButton afterSignOutUrl="/login" />
      </nav>

      <div className="max-w-3xl mx-auto p-8 space-y-6">

        {/* Property Header */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-blue-900">{property.address}</h1>
              <p className="text-gray-600 mt-1">{property.owner_name}</p>
              <p className="text-sm text-gray-400 mt-0.5">{property.owner_email}</p>
            </div>
            <span className={`text-lg font-bold px-4 py-2 rounded-xl border flex-shrink-0 ${scoreColor(score)}`}>
              Score: {score}
            </span>
          </div>
        </div>

        {/* Open Violations */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Open Violations</h2>
            {openViolations.length > 0 && (
              <span className="text-sm text-orange-600 font-medium">{openViolations.length} open</span>
            )}
          </div>
          {openViolations.length === 0 ? (
            <p className="p-6 text-gray-400 text-sm">No open violations — great work!</p>
          ) : (
            <div className="divide-y">
              {openViolations.map(v => (
                <div key={v.id} className="p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[v.severity]}`}>
                      {v.severity}
                    </span>
                    <span className="text-sm font-medium text-gray-800 capitalize">{v.category}</span>
                    {v.fine_amount != null && parseFloat(v.fine_amount) > 0 && (
                      <span className="text-xs text-red-600 font-semibold ml-auto">
                        Fine: {fmt(v.fine_amount)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{v.description}</p>
                  {v.remediation && (
                    <div className="text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                      <span className="font-medium">How to fix: </span>{v.remediation}
                    </div>
                  )}
                  <button
                    disabled={flagging === v.id}
                    onClick={() => handleFlagFixed(v.id)}
                    className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {flagging === v.id ? 'Submitting...' : "I've fixed this"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Review Violations */}
        {pendingViolations.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-600">Awaiting Admin Review</h2>
            </div>
            <div className="divide-y">
              {pendingViolations.map(v => (
                <div key={v.id} className="p-6 space-y-1 opacity-70">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[v.severity]}`}>
                      {v.severity}
                    </span>
                    <span className="text-sm font-medium text-gray-700 capitalize">{v.category}</span>
                  </div>
                  <p className="text-sm text-gray-600">{v.description}</p>
                  <p className="text-xs text-blue-600 font-medium pt-1">
                    Submitted for review — admin will confirm
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bills */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-800">Monthly Bills</h2>
          </div>
          {bills.length === 0 ? (
            <p className="p-6 text-gray-400 text-sm">No bills yet.</p>
          ) : (
            <div className="divide-y">
              {bills.map(bill => (
                <div key={bill.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800">{fmtMonth(bill.billing_month)}</p>
                    <p className="text-sm text-gray-500">
                      Base {fmt(bill.base_amount)}
                      {parseFloat(bill.violation_fines) > 0 && ` + fines ${fmt(bill.violation_fines)}`}
                      {' · '}Due {fmtDate(bill.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${BILL_STATUS_COLORS[bill.status]}`}>
                      {bill.status.toUpperCase()}
                    </span>
                    <span className="font-semibold text-gray-800">{fmt(bill.total_amount)}</span>
                    {bill.status !== 'paid' ? (
                      <button
                        disabled={paying === bill.id}
                        onClick={() => handlePayBill(bill.id)}
                        className="px-3 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                      >
                        {paying === bill.id ? 'Saving...' : 'Pay Now'}
                      </button>
                    ) : bill.paid_at ? (
                      <span className="text-xs text-gray-400">Paid {fmtDate(bill.paid_at)}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
```

**Step 2: Verify frontend starts and compiles**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/frontend && npm run dev
```

Expected: no errors.

**Step 3: Commit**

```bash
git add frontend/src/pages/TenantDashboard.jsx
git commit -m "feat: add TenantDashboard page for tenant portal"
```

---

### Task 7: Update `ViolationRow` and `PropertyDetail` for `pending_review`

**Files:**
- Modify: `frontend/src/components/ViolationRow.jsx`
- Modify: `frontend/src/pages/PropertyDetail.jsx`

**Context:** `ViolationRow` renders a row in the admin's violation table. It needs to show a "Pending Review" badge and add "Confirm" / "Reject" action buttons for `pending_review` violations. `PropertyDetail` needs to pass an `onReopened` callback and add `'pending_review'` to the status filter pills.

**Step 1: Rewrite `frontend/src/components/ViolationRow.jsx`**

```jsx
import { Link } from 'react-router-dom';
import { resolveViolation, reopenViolation } from '../api';

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high:   'bg-red-100 text-red-800',
};

const STATUS_STYLES = {
  open:           'bg-orange-100 text-orange-700',
  pending_review: 'bg-blue-100 text-blue-700',
  resolved:       'bg-gray-100 text-gray-600',
};

function daysRemaining(createdAt, deadlineDays) {
  const deadline = new Date(createdAt);
  deadline.setDate(deadline.getDate() + deadlineDays);
  return Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function ViolationRow({ violation, onResolved, onReopened }) {
  const handleResolve = async () => {
    if (!window.confirm('Confirm this violation is resolved?')) return;
    await resolveViolation(violation.id);
    onResolved(violation.id);
  };

  const handleReopen = async () => {
    if (!window.confirm('Reject the fix and reopen this violation?')) return;
    await reopenViolation(violation.id);
    onReopened(violation.id);
  };

  const remaining = violation.status === 'open' && violation.deadline_days
    ? daysRemaining(violation.created_at, violation.deadline_days)
    : null;

  return (
    <tr className="border-b hover:bg-gray-50 transition">
      <td className="py-3 px-4 text-sm text-gray-500">
        {new Date(violation.created_at).toLocaleDateString()}
      </td>
      <td className="py-3 px-4 capitalize text-sm font-medium text-gray-800">
        {violation.category}
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[violation.severity]}`}>
          {violation.severity}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-600 max-w-xs">
        <p className="truncate">{violation.description}</p>
        {violation.status === 'open' && remaining !== null && (
          <p className={`text-xs mt-0.5 font-medium ${
            remaining <= 3 ? 'text-red-500' : remaining <= 7 ? 'text-orange-500' : 'text-gray-400'
          }`}>
            {remaining > 0
              ? `${remaining}d to resolve`
              : remaining === 0
              ? 'Due today'
              : `${Math.abs(remaining)}d overdue`}
          </p>
        )}
        {violation.status === 'resolved' && violation.resolved_at && (
          <p className="text-xs mt-0.5 text-green-600">
            Resolved {new Date(violation.resolved_at).toLocaleDateString()}
          </p>
        )}
        {violation.status === 'pending_review' && (
          <p className="text-xs mt-0.5 text-blue-600">Tenant marked as fixed</p>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-600">
        {violation.fine_amount != null ? `$${parseFloat(violation.fine_amount).toFixed(2)}` : '—'}
      </td>
      <td className="py-3 px-4">
        <div className="flex flex-col gap-1">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full w-fit ${
            STATUS_STYLES[violation.status] || 'bg-gray-100 text-gray-600'
          }`}>
            {violation.status === 'pending_review' ? 'Pending Review' : violation.status}
          </span>
          {violation.notice_sent_at && (
            <span className="text-xs text-blue-500">
              Notice sent {new Date(violation.notice_sent_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            to={`/properties/${violation.property_id}/violations/${violation.id}/edit`}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Edit
          </Link>
          {violation.status === 'open' && (
            <button onClick={handleResolve} className="text-sm text-gray-500 hover:underline">
              Resolve
            </button>
          )}
          {violation.status === 'pending_review' && (
            <>
              <button onClick={handleResolve}
                className="text-sm font-semibold text-green-600 hover:underline">
                Confirm
              </button>
              <button onClick={handleReopen}
                className="text-sm text-red-500 hover:underline">
                Reject
              </button>
            </>
          )}
          {violation.image_url && (
            <a href={violation.image_url} target="_blank" rel="noreferrer"
              className="text-xs text-gray-400 hover:underline">
              Photo
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
```

**Step 2: Update `frontend/src/pages/PropertyDetail.jsx`**

Make two targeted edits:

**Edit A — add `handleReopened` handler** (after line 63, after `handleResolved`):

```js
const handleReopened = (violationId) => {
  setProperty(prev => ({
    ...prev,
    violations: prev.violations.map(v =>
      v.id === violationId ? { ...v, status: 'open' } : v
    ),
  }));
  reload();
};
```

**Edit B — add `pending_review` to status filter pills** (line 210):

Replace:
```jsx
{['all', 'open', 'resolved'].map(s => (
  <button key={s} className={pill(statusFilter === s)} onClick={() => setStatusFilter(s)}>
    {s.charAt(0).toUpperCase() + s.slice(1)}
  </button>
))}
```

With:
```jsx
{['all', 'open', 'pending_review', 'resolved'].map(s => (
  <button key={s} className={pill(statusFilter === s)} onClick={() => setStatusFilter(s)}>
    {s === 'pending_review' ? 'Pending Review' : s.charAt(0).toUpperCase() + s.slice(1)}
  </button>
))}
```

**Edit C — pass `onReopened` to `ViolationRow`** (line 267):

Replace:
```jsx
<ViolationRow key={v.id} violation={v} onResolved={handleResolved} />
```

With:
```jsx
<ViolationRow key={v.id} violation={v} onResolved={handleResolved} onReopened={handleReopened} />
```

**Step 3: Verify frontend compiles**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/frontend && npm run dev
```

Expected: no TypeScript/JSX errors.

**Step 4: Commit**

```bash
git add frontend/src/components/ViolationRow.jsx frontend/src/pages/PropertyDetail.jsx
git commit -m "feat: pending_review support in ViolationRow and PropertyDetail admin view"
```

---

## End-to-End Verification Checklist

**Tenant flow:**
- [ ] Create a Clerk user with the same email as a property's `owner_email` in the DB
- [ ] Sign in with that user → should see `TenantDashboard` (not admin dashboard)
- [ ] Compliance score badge shows correct color (green/yellow/red)
- [ ] Open violations appear with remediation instructions
- [ ] Clicking "I've fixed this" optimistically moves the violation to the "Awaiting Admin Review" section
- [ ] Bills appear newest-first; unpaid bills show "Pay Now" button
- [ ] Clicking "Pay Now" marks the bill as paid (optimistic update)
- [ ] Signing out and signing back in as admin shows the admin dashboard

**Admin flow:**
- [ ] Sign in as admin → sees admin dashboard as before
- [ ] Navigate to a property → violation table shows "Pending Review" status filter pill
- [ ] A violation in `pending_review` state shows "Pending Review" badge and "Confirm" / "Reject" buttons
- [ ] "Confirm" resolves the violation; score updates
- [ ] "Reject" reopens the violation back to `open`
- [ ] Tenant portal refreshes correctly after admin action (tenant needs to re-sign in or refresh)
