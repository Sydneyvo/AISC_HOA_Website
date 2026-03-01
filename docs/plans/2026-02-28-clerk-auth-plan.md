# Clerk Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Protect the entire HOA dashboard behind a Clerk login so only the admin can access any route.

**Architecture:** Clerk wraps the React app via `ClerkProvider`; unauthenticated users are redirected to a `/login` page that renders Clerk's built-in `<SignIn>`. A module-level `setTokenGetter` in `api.js` lets the `App` component inject the Clerk token, which is then attached as `Authorization: Bearer` on every API call. On the backend, `clerkMiddleware()` + `requireAuth()` from `@clerk/express` protect all `/api/*` routes.

**Tech Stack:** `@clerk/clerk-react` (frontend), `@clerk/express` (backend), Clerk dashboard (account setup)

---

### Task 1: Create a Clerk account and get API keys

> This is a manual step — no code changes.

**Step 1: Sign up at clerk.com**

Go to https://clerk.com, create a free account, and create a new Application.
- Application name: "HOA Dashboard"
- Enable **Email + Password** as the sign-in method (disable social logins for now)

**Step 2: Copy keys**

In the Clerk Dashboard → API Keys:
- Copy the **Publishable key** (starts with `pk_test_...`)
- Copy the **Secret key** (starts with `sk_test_...`)

**Step 3: Add to env files**

In `frontend/.env` (create if missing):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

In `backend/.env` (add alongside existing vars):
```
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
```

**Step 4: Create the admin user**

In Clerk Dashboard → Users → "Create user":
- Set an email and password for yourself — this is the login credential you'll use.

**Verify:** Both `.env` files have the keys; you have a Clerk user created.

---

### Task 2: Install dependencies

**Files:**
- Modify: `backend/package.json` (via npm install)
- Modify: `frontend/package.json` (via npm install)

**Step 1: Install backend package**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/backend
npm install @clerk/express
```

Expected: `@clerk/express` appears in `backend/package.json` dependencies.

**Step 2: Install frontend package**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website/frontend
npm install @clerk/clerk-react
```

Expected: `@clerk/clerk-react` appears in `frontend/package.json` dependencies.

**Step 3: Commit**

```bash
cd /Users/shourya-isr/Desktop/AISC_HOA_Website
git add backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
git commit -m "deps: add @clerk/express and @clerk/clerk-react"
```

---

### Task 3: Protect backend routes with Clerk middleware

**Files:**
- Modify: `backend/src/index.js`

**Step 1: Read current file**

Read `backend/src/index.js` to confirm current content before editing.

**Step 2: Add Clerk middleware**

Replace the route registrations block in `backend/src/index.js`:

```js
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
require('dotenv').config();

const { clerkMiddleware, requireAuth } = require('@clerk/express');

const db  = require('./db');
const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use(clerkMiddleware());

// Routes — all protected by Clerk
app.use('/api/properties', requireAuth(), require('./routes/properties'));
app.use('/api/violations', requireAuth(), require('./routes/violations'));
app.use('/api/dashboard',  requireAuth(), require('./routes/dashboard'));
app.use('/api/finance',    requireAuth(), require('./routes/bills'));

// Health check — intentionally unprotected
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;

// Start server immediately — don't block on DB
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

// Run migration + overdue check in background after startup
(async () => {
  try {
    const migrationSql = fs.readFileSync(
      path.join(__dirname, 'db', 'migrate.sql'), 'utf8'
    );
    await db.query(migrationSql);
    console.log('DB migration applied');
  } catch (err) {
    console.error('DB migration error (non-fatal):', err.message);
  }

  const { checkOverdueBills } = require('./routes/bills');
  checkOverdueBills();
  setInterval(checkOverdueBills, 60 * 60 * 1000);
})();
```

**Step 3: Restart backend and verify health check still works**

```bash
cd backend && npm run dev
```

In a new terminal:
```bash
curl http://localhost:3001/health
```
Expected: `{"ok":true}`

Then verify a protected route now returns 401 without auth:
```bash
curl http://localhost:3001/api/properties
```
Expected: `401` or `403` response (not JSON data).

**Step 4: Commit**

```bash
git add backend/src/index.js
git commit -m "feat: protect all /api routes with Clerk requireAuth middleware"
```

---

### Task 4: Update `api.js` to attach the Clerk Bearer token

**Files:**
- Modify: `frontend/src/api.js`

**The pattern:** `api.js` is a plain module (not a React hook), so it can't call `useAuth()` directly. We expose a `setTokenGetter(fn)` function that `App.jsx` will call once to register the Clerk `getToken` function. Every fetch call then awaits the token before sending.

**Step 1: Rewrite `frontend/src/api.js`**

```js
const BASE = import.meta.env.VITE_API_URL;

// Injected by App.jsx after Clerk initializes
let _getToken = async () => null;
export function setTokenGetter(fn) { _getToken = fn; }

// Build auth headers, merging any extra headers passed in
async function authHeaders(extra = {}) {
  const token = await _getToken();
  if (token) extra['Authorization'] = `Bearer ${token}`;
  return extra;
}

const json = async (r) => {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

// Screen 1
export const getProperties = async () =>
  fetch(`${BASE}/api/properties`, {
    headers: await authHeaders(),
  }).then(json);

export const getViolationsTimeline = async () =>
  fetch(`${BASE}/api/dashboard/violations-timeline`, {
    headers: await authHeaders(),
  }).then(json);

// Screen 2
export const getProperty = async (id) =>
  fetch(`${BASE}/api/properties/${id}`, {
    headers: await authHeaders(),
  }).then(json);

export const resolveViolation = async (id) =>
  fetch(`${BASE}/api/violations/${id}/resolve`, {
    method: 'PATCH',
    headers: await authHeaders(),
  }).then(json);

export const getViolation = async (id) =>
  fetch(`${BASE}/api/violations/${id}`, {
    headers: await authHeaders(),
  }).then(json);

export const updateViolation = async (id, data) =>
  fetch(`${BASE}/api/violations/${id}`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

// Screen 3 — uses FormData (NOT JSON) because we're uploading a file
export const analyzeViolation = async (file, propertyId, hint = '') => {
  const form = new FormData();
  form.append('file', file);
  form.append('property_id', propertyId);
  form.append('hint', hint);
  return fetch(`${BASE}/api/violations/analyze`, {
    method: 'POST',
    headers: await authHeaders(), // no Content-Type — browser sets it with boundary
    body: form,
  }).then(json);
};

export const submitViolation = async (data) =>
  fetch(`${BASE}/api/violations`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

export const createProperty = async (data) =>
  fetch(`${BASE}/api/properties`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

export const deleteProperty = async (id) =>
  fetch(`${BASE}/api/properties/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  }).then(json);

export const uploadRulesPdf = async (propertyId, file) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE}/api/properties/${propertyId}/rules-pdf`, {
    method: 'POST',
    headers: await authHeaders(), // no Content-Type — browser sets it with boundary
    body: form,
  }).then(json);
};

// Finance
export const getFinance = async () =>
  fetch(`${BASE}/api/finance`, {
    headers: await authHeaders(),
  }).then(json);

export const getPropertyBills = async (propertyId) =>
  fetch(`${BASE}/api/finance/property/${propertyId}`, {
    headers: await authHeaders(),
  }).then(json);

export const payBill = async (billId) =>
  fetch(`${BASE}/api/finance/${billId}/pay`, {
    method: 'PATCH',
    headers: await authHeaders(),
  }).then(json);
```

**Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: attach Clerk Bearer token to all API calls via setTokenGetter"
```

---

### Task 5: Wrap the app with ClerkProvider

**Files:**
- Modify: `frontend/src/main.jsx`

**Step 1: Rewrite `frontend/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import './index.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ClerkProvider>
);
```

**Step 2: Commit**

```bash
git add frontend/src/main.jsx
git commit -m "feat: wrap app with ClerkProvider"
```

---

### Task 6: Create the Login page

**Files:**
- Create: `frontend/src/pages/LoginPage.jsx`

**Step 1: Create `frontend/src/pages/LoginPage.jsx`**

```jsx
import { SignIn } from '@clerk/clerk-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-blue-900">HOA Compliance</h1>
        <p className="text-gray-500 mt-1 text-sm">Admin Dashboard</p>
      </div>
      <SignIn routing="hash" />
    </div>
  );
}
```

> **Note:** `routing="hash"` tells Clerk's `<SignIn>` to use hash-based routing instead of the default path-based routing. This avoids conflicts with React Router's `<BrowserRouter>` so you don't need to add a Clerk callback route.

**Step 2: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx
git commit -m "feat: add LoginPage with Clerk SignIn component"
```

---

### Task 7: Gate all routes in App.jsx and register token getter

**Files:**
- Modify: `frontend/src/App.jsx`

**Step 1: Rewrite `frontend/src/App.jsx`**

```jsx
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/clerk-react';
import { setTokenGetter } from './api';
import Dashboard      from './pages/Dashboard';
import PropertyDetail from './pages/PropertyDetail';
import ViolationForm  from './pages/ViolationForm';
import ViolationEdit  from './pages/ViolationEdit';
import LoginPage      from './pages/LoginPage';

// Registers the Clerk token getter with api.js once on mount
function AuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => { setTokenGetter(getToken); }, [getToken]);
  return null;
}

export default function App() {
  return (
    <>
      <SignedIn>
        <AuthBridge />
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between">
            <a href="/" className="font-bold text-lg hover:opacity-80">HOA Compliance</a>
            <UserButton afterSignOutUrl="/login" />
          </nav>
          <Routes>
            <Route path="/"                                            element={<Dashboard />} />
            <Route path="/properties/:id"                              element={<PropertyDetail />} />
            <Route path="/properties/:id/violations/new"               element={<ViolationForm />} />
            <Route path="/properties/:id/violations/:violId/edit"      element={<ViolationEdit />} />
            <Route path="/login"                                       element={<Navigate to="/" replace />} />
          </Routes>
        </div>
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

> **Key points:**
> - `<AuthBridge>` is a side-effect component inside `<SignedIn>` — it runs `setTokenGetter(getToken)` so all subsequent API calls automatically attach the Clerk JWT.
> - `<UserButton afterSignOutUrl="/login" />` renders a Clerk avatar that opens a sign-out dropdown.
> - `<SignedOut>` catches all routes and redirects to `/login`. The login page itself doesn't redirect (so the Clerk component can render).
> - When signed in, `/login` redirects to `/` so the admin can't land on the login page.

**Step 2: Start the frontend and verify login page appears**

```bash
cd frontend && npm run dev
```

Visit http://localhost:5173 — you should be redirected to `/login` and see the Clerk sign-in form. Log in with the credentials you created in Task 1. You should land on the dashboard.

**Step 3: Verify API calls work after login**

Open DevTools Network tab. Reload the dashboard. Confirm that requests to `/api/properties` have an `Authorization: Bearer ...` header and return `200`.

**Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: gate all routes with Clerk SignedIn/SignedOut, register token getter"
```

---

## End-to-End Verification Checklist

- [ ] Visiting http://localhost:5173 without being logged in redirects to `/login`
- [ ] Clerk sign-in form appears on `/login`
- [ ] Logging in with the Clerk admin user lands on the dashboard
- [ ] All dashboard data loads (properties, finance tab)
- [ ] `Authorization: Bearer` header is present in all API calls (DevTools Network)
- [ ] Backend returns `200` for authenticated requests
- [ ] Backend returns `401` for unauthenticated requests (test with `curl http://localhost:3001/api/properties`)
- [ ] Clicking the `<UserButton>` avatar in the nav shows a sign-out option
- [ ] Signing out redirects back to `/login`
- [ ] Visiting any route after sign-out redirects to `/login`
