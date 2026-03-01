# Clerk Authentication — Design Doc
**Date:** 2026-02-28

## Problem
The HOA dashboard is currently unprotected — any URL is accessible without authentication. A single admin needs a login gate before accessing any page.

## Decision
Use **Clerk** (hosted auth service) with a single admin user. No custom user management or DB changes required.

## Architecture

```
Browser (unauthenticated)
  → visits any route
  → <SignedOut> redirects to /login
  → Clerk <SignIn> component renders
  → admin enters credentials
  → Clerk issues session JWT

Browser (authenticated)
  → all routes accessible via <SignedIn>
  → api.js fetches Clerk token via useAuth().getToken()
  → every fetch() sends Authorization: Bearer <token>
  → backend requireAuth() middleware verifies JWT via Clerk SDK
  → request proceeds to route handler
```

## Frontend Changes

### `frontend/src/main.jsx`
- Wrap `<App>` with `<ClerkProvider publishableKey={...}>` using `VITE_CLERK_PUBLISHABLE_KEY`

### `frontend/src/App.jsx`
- Add `/login` route → new `<LoginPage>` component
- Wrap all existing routes in `<SignedIn>`
- Add `<SignedOut><Navigate to="/login" /></SignedOut>` catch-all
- Add `<UserButton>` (Clerk's avatar + sign-out dropdown) to the nav bar

### `frontend/src/pages/LoginPage.jsx` (new)
- Centered page with HOA branding above Clerk's `<SignIn>` component

### `frontend/src/api.js`
- Export a `setAuthTokenGetter(fn)` that stores a reference to `useAuth().getToken`
- All fetch helpers call `await getToken()` and attach `Authorization: Bearer <token>`
- Alternative: use a thin wrapper hook `useApi()` that injects the token

## Backend Changes

### `backend/src/index.js`
- `npm install @clerk/express`
- Import `{ requireAuth, clerkMiddleware }` from `@clerk/express`
- Add `clerkMiddleware()` globally (parses auth state on every request)
- Add `requireAuth()` before each route group:
  ```js
  app.use('/api/properties', requireAuth(), require('./routes/properties'));
  app.use('/api/violations', requireAuth(), require('./routes/violations'));
  app.use('/api/dashboard',  requireAuth(), require('./routes/dashboard'));
  app.use('/api/finance',    requireAuth(), require('./routes/bills'));
  ```
- Keep `/health` unprotected

## Environment Variables

```bash
# frontend/.env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# backend/.env
CLERK_SECRET_KEY=sk_test_...
```

The admin creates a Clerk account at clerk.com, creates an Application, and copies these two keys.

## No DB Changes
Clerk manages its own user store. No `users` table needed.

## Dependencies
- Frontend: `@clerk/clerk-react`
- Backend: `@clerk/express`

## Out of Scope
- Multiple admin roles / permissions
- Social OAuth (Google, GitHub) — can be enabled later in Clerk dashboard with zero code changes
- Email invite flow for additional admins
