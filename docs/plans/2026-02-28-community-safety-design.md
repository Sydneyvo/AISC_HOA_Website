# Community Safety Module — Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

A community bulletin board shared between HOA admins and all tenants. Both sides can post announcements (safety alerts, lost pets, wildlife sightings, road damage, HOA notices, etc.) and view a common feed. Posts go live immediately. Authors can delete their own posts; admins can delete any post.

---

## Data Model

New table: `community_posts`

```sql
CREATE TABLE IF NOT EXISTS community_posts (
  id           SERIAL PRIMARY KEY,
  author_email VARCHAR(255) NOT NULL,
  author_name  VARCHAR(255) NOT NULL,
  author_role  VARCHAR(10)  NOT NULL CHECK (author_role IN ('admin', 'tenant')),
  category     VARCHAR(50)  NOT NULL CHECK (category IN (
                 'safety', 'lost_pet', 'wildlife',
                 'infrastructure', 'hoa_notice', 'general'
               )),
  title        VARCHAR(255) NOT NULL,
  body         TEXT         NOT NULL,
  image_url    TEXT,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);
```

Added via `migrate.sql` so it auto-runs on server startup.

Image files stored in a new Azure Blob container: `communitycont`.

---

## API Routes

Registered at `app.use('/api/community', requireAuth(), require('./routes/community'))` in `index.js`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/community` | All | Returns all posts newest-first. Optional `?category=` filter. |
| `POST` | `/api/community` | All | `multipart/form-data`: `title`, `body`, `category`, optional `image`. Author identity read from Clerk token. |
| `DELETE` | `/api/community/:id` | Author or admin | Deletes post. Checks `author_email === req.auth.email` OR requester is admin (email not in `properties.owner_email`). Deletes blob if present. |

### Email notification side-effect (POST)

If `ANNOUNCE_EMAIL_NOTIFY=true` in `.env`, after saving the post the server fires an async SendGrid blast to every `owner_email` in the `properties` table:

- **Subject**: `New HOA Community Post — [Category]`
- **Body**: "A new announcement has been posted on the HOA community board. Log in to the portal to view it."
- Fires after response is sent (non-blocking). Failures are logged, not surfaced to the user.

---

## Frontend

### Shared component: `CommunityBoard`

`frontend/src/components/CommunityBoard.jsx`

Props:
- `currentUserEmail: string` — to determine which delete buttons to show
- `isAdmin: boolean` — admins can delete any post

**Layout:**
1. **Filter pills** — `All | Safety | Lost Pet | Wildlife | Infrastructure | HOA Notice | General`
2. **"New Post" button** (top right) — toggles an inline compose form
3. **Compose form** (inline, above feed when open):
   - Title input
   - Body textarea
   - Category select dropdown
   - Optional image file input
   - Submit / Cancel buttons
4. **Post feed** — vertical card list, newest first

**Post card:**
```
┌─────────────────────────────────────────────────────┐
│ [SAFETY] badge     Jane Doe · Tenant    3h ago   [×]│
│                                                     │
│ Coyote spotted near Pine Rd                         │
│ Seen near the park entrance around 6pm. Keep pets   │
│ indoors. Calling animal control.                    │
│ [image if present]                                  │
└─────────────────────────────────────────────────────┘
```

Category badge colors:
- `safety` → red (`bg-red-100 text-red-700`)
- `lost_pet` → orange (`bg-orange-100 text-orange-700`)
- `wildlife` → yellow (`bg-yellow-100 text-yellow-700`)
- `infrastructure` → purple (`bg-purple-100 text-purple-700`)
- `hoa_notice` → blue (`bg-blue-100 text-blue-700`)
- `general` → gray (`bg-gray-100 text-gray-600`)

`[×]` delete button: visible only if `post.author_email === currentUserEmail || isAdmin`.

### Admin integration

- New `"Community"` link in the admin nav bar
- New route `/community` in `App.jsx` → `<CommunityPage />` page
- `CommunityPage` wraps `CommunityBoard` inside the existing nav shell
- `currentUserEmail` and `isAdmin={true}` passed as props

### Tenant integration

- Tab switcher at the top of `TenantDashboard` with two tabs: **My Property** | **Community**
- Switching to Community renders `CommunityBoard` with `isAdmin={false}` and the tenant's email
- Default active tab: My Property (no change to existing default view)

---

## New API helper functions (api.js)

```js
getCommunityPosts(category?)    // GET /api/community?category=...
createCommunityPost(formData)   // POST /api/community  (FormData)
deleteCommunityPost(id)         // DELETE /api/community/:id
```

---

## Environment variables

```
# .env additions
ANNOUNCE_EMAIL_NOTIFY=false   # set true to blast email on new posts
```

---

## Files changed / created

| File | Change |
|------|--------|
| `backend/src/db/migrate.sql` | Add `community_posts` table |
| `backend/src/routes/community.js` | New — GET, POST, DELETE handlers |
| `backend/src/services/email.js` | Add `sendCommunityAnnouncement()` |
| `backend/src/index.js` | Register `/api/community` route |
| `backend/.env` | Add `ANNOUNCE_EMAIL_NOTIFY` |
| `frontend/src/api.js` | Add 3 community API helpers |
| `frontend/src/components/CommunityBoard.jsx` | New — shared board component |
| `frontend/src/pages/CommunityPage.jsx` | New — admin route wrapper |
| `frontend/src/pages/TenantDashboard.jsx` | Add tab switcher |
| `frontend/src/App.jsx` | Add `/community` route + nav link |
