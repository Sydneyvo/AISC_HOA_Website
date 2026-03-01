# Tenant Portal — Design Doc
**Date:** 2026-02-28

## Problem
The HOA dashboard is admin-only. Homeowners have no self-service view: they can't see their compliance status, open violations, or pay bills without calling the admin.

## Decision
Add a tenant-facing portal inside the same React app. After Clerk sign-in, the backend maps the user's email to a property. Email match → tenant portal. No match → admin dashboard. No separate app, no separate deployment.

## Architecture

```
Browser (any user)
  → signs in via Clerk on /login
  → App.jsx calls GET /api/tenant/me with Bearer token
  → backend looks up clerkClient.users.getUser(userId) → email
  → queries: SELECT * FROM properties WHERE owner_email = email
  → returns { role: 'tenant', property, violations, bills }
       or  { role: 'admin' }
  → frontend renders TenantDashboard OR existing admin Routes
```

## DB Change

Add `'pending_review'` to the violations status constraint:

```sql
ALTER TABLE violations DROP CONSTRAINT violations_status_check;
ALTER TABLE violations ADD CONSTRAINT violations_status_check
  CHECK (status IN ('open', 'pending_review', 'resolved'));
```

Violation lifecycle:
- Admin creates → `open`
- Tenant flags fixed → `pending_review`
- Admin confirms → `resolved`  (or rejects → back to `open`)

## Backend Changes

### New file: `backend/src/routes/tenant.js`

Registered at `/api/tenant` in `index.js` (protected by `requireAuth()`).

| Method | Path | Logic |
|--------|------|-------|
| `GET`  | `/me` | Get Clerk user email via `clerkClient.users.getUser(req.auth.userId)`. Query `properties WHERE owner_email = email`. If found: return `{ role: 'tenant', property, violations, bills }`. Else: return `{ role: 'admin' }`. |
| `PATCH` | `/violations/:id/flag-fixed` | Set `status = 'pending_review'` where `id = $1 AND property_id = (tenant's property id)`. 403 if not their violation. |
| `PATCH` | `/bills/:id/pay` | Set `status = 'paid', paid_at = NOW()` where `id = $1 AND property_id = (tenant's property id)`. Calls `recalcScore`. 403 if not their bill. |

### Existing route changes

- `backend/src/routes/violations.js` — `PATCH /:id/resolve` already sets `status = 'resolved'`. No change needed.
- `backend/src/routes/violations.js` — `PATCH /:id` (updateViolation) — admin can set `status: 'open'` to reject a pending_review. No change needed (already accepts any status).
- `backend/src/db/migrate.sql` — append the status constraint migration.

## Frontend Changes

### `frontend/src/App.jsx`

After `AuthBridge` sets the token, call `GET /api/tenant/me`. While loading: spinner. On resolve: store `{ role, property }` in state. Render `<TenantDashboard property={...} />` or admin `<Routes>` based on role.

### New file: `frontend/src/pages/TenantDashboard.jsx`

Single-page view, no sub-routes needed:

1. **Property header** — address, owner name, compliance score badge (green ≥ 80, yellow ≥ 60, red < 60)
2. **Violations section**
   - *Open* card: category, severity chip, description, remediation. "I've fixed this" button → `PATCH /api/tenant/violations/:id/flag-fixed` → optimistic UI update to pending_review
   - *Awaiting review* card: greyed out, shows "Submitted for review — admin will confirm"
   - *Resolved* card: collapsed/dimmed list
3. **Bills section** — list newest-first; pending/overdue rows show "Pay Now" button → `PATCH /api/tenant/bills/:id/pay` → optimistic update to paid

### `frontend/src/pages/PropertyDetail.jsx`

Add a **"Pending Review"** section between Open and Resolved:
- Shows violation details
- "Confirm Resolved" button → calls existing `PATCH /api/violations/:id/resolve`
- "Reject (reopen)" button → calls existing `PATCH /api/violations/:id` with `{ status: 'open' }`

### `frontend/src/api.js`

Add three new fetch helpers:
- `getTenantMe()` → `GET /api/tenant/me`
- `flagViolationFixed(id)` → `PATCH /api/tenant/violations/:id/flag-fixed`
- `tenantPayBill(id)` → `PATCH /api/tenant/bills/:id/pay`

## No New Environment Variables
`clerkClient` is constructed from the existing `CLERK_SECRET_KEY`.

## Out of Scope
- Email notification to tenant when admin confirms/rejects a fix
- Tenant ability to dispute violations
- Multiple tenants per property
