# Community Safety Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a community bulletin board where HOA admins and tenants can post announcements (safety alerts, lost pets, wildlife, infrastructure issues) visible to all residents.

**Architecture:** Single shared `CommunityBoard` React component (props: `currentUserEmail`, `isAdmin`) used in both admin (`/community` route) and tenant (tab switcher in `TenantDashboard`). Backend is three REST endpoints under `/api/community` with multer for optional image upload and async SendGrid blast controlled by `ANNOUNCE_EMAIL_NOTIFY` env bool.

**Tech Stack:** Express + multer + pg + @azure/storage-blob + @sendgrid/mail + React 18 + Tailwind CSS + @clerk/clerk-react + @clerk/express

---

### Task 1: DB Migration — community_posts table

**Files:**
- Modify: `backend/src/db/migrate.sql`

**Step 1: Append the new table to migrate.sql**

Open `backend/src/db/migrate.sql` and add at the very end:

```sql
-- Migration: community safety module
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

**Step 2: Verify migration runs**

Restart the backend (`cd backend && npm run dev`) and check the console for:
```
DB migration applied
```

Then confirm the table exists:
```bash
psql "postgresql://hoahoa:Hackathon123@hackathon123.postgres.database.azure.com:5432/postgres?sslmode=require" \
  -c "\d community_posts"
```
Expected: table schema printed with all columns.

**Step 3: Commit**

```bash
git add backend/src/db/migrate.sql
git commit -m "feat: add community_posts table migration"
```

---

### Task 2: Email helper — sendCommunityAnnouncement

**Files:**
- Modify: `backend/src/services/email.js`

**Step 1: Add the function at the bottom of email.js, before `module.exports`**

```js
async function sendCommunityAnnouncement({ authorName, authorRole, category, title, recipients }) {
  const categoryLabel = {
    safety: 'Safety Alert',
    lost_pet: 'Lost Pet',
    wildlife: 'Wildlife',
    infrastructure: 'Infrastructure',
    hoa_notice: 'HOA Notice',
    general: 'General',
  }[category] || category;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#1e3a5f;padding:24px 32px;color:white;">
        <h1 style="margin:0;font-size:20px;font-weight:bold;">New Community Post — ${categoryLabel}</h1>
        <p style="margin:6px 0 0;opacity:0.75;font-size:14px;">
          ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>
      <div style="padding:28px 32px;background:#f9fafb;">
        <p style="margin:0 0 16px;color:#374151;">
          <strong>${authorName}</strong> (${authorRole === 'admin' ? 'HOA Management' : 'Resident'}) posted a new announcement:
        </p>
        <div style="background:white;border:1px solid #e5e7eb;border-left:4px solid #1e3a5f;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0;font-size:16px;font-weight:bold;color:#111827;">${title}</p>
        </div>
        <p style="color:#374151;">Log in to the HOA portal to read the full post and join the community board.</p>
        <p style="font-weight:bold;color:#1e3a5f;">HOA Management</p>
      </div>
      <div style="padding:16px 32px;background:#f3f4f6;text-align:center;font-size:12px;color:#6b7280;">
        This notification was sent by your Homeowners Association.
      </div>
    </div>
  `;

  await Promise.allSettled(
    recipients.map(email =>
      sgMail.send({
        to:      email,
        from:    process.env.FROM_EMAIL,
        subject: `New HOA Community Post — ${categoryLabel}`,
        html,
      })
    )
  );
}
```

**Step 2: Add `sendCommunityAnnouncement` to module.exports**

Find the existing `module.exports` line:
```js
module.exports = { sendViolationNotice, sendOverdueReminder };
```
Change it to:
```js
module.exports = { sendViolationNotice, sendOverdueReminder, sendCommunityAnnouncement };
```

**Step 3: Commit**

```bash
git add backend/src/services/email.js
git commit -m "feat: add sendCommunityAnnouncement email helper"
```

---

### Task 3: Backend route — /api/community

**Files:**
- Create: `backend/src/routes/community.js`
- Modify: `backend/src/index.js`
- Modify: `backend/.env`

**Step 1: Add env variable**

Open `backend/.env` and add:
```
ANNOUNCE_EMAIL_NOTIFY=false
```
(Set to `true` later if you want emails sent on every new post.)

**Step 2: Create `backend/src/routes/community.js`**

```js
const express  = require('express');
const multer   = require('multer');
const db       = require('../db');
const { uploadToBlob, deleteBlob }         = require('../services/azure');
const { createClerkClient }                = require('@clerk/express');
const { sendCommunityAnnouncement }        = require('../services/email');

const router      = express.Router();
const upload      = multer({ storage: multer.memoryStorage() });
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Resolves Clerk userId → { email, name }
async function getCallerInfo(req) {
  const user  = await clerkClient.users.getUser(req.auth.userId);
  const email =
    user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ||
    user.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error('No email on Clerk account');
  const name = user.fullName || user.firstName || email.split('@')[0];
  return { email, name };
}

// Determine role: tenant if email is in properties table, admin otherwise
async function getRole(email) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM properties WHERE owner_email = $1', [email]
  );
  return rowCount > 0 ? 'tenant' : 'admin';
}

// GET /api/community?category=safety
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const params = [];
    let where = '';
    if (category && category !== 'all') {
      params.push(category);
      where = `WHERE category = $1`;
    }
    const { rows } = await db.query(
      `SELECT * FROM community_posts ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('Community GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/community  — multipart/form-data: title, body, category, image(optional)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { email, name } = await getCallerInfo(req);
    const role             = await getRole(email);
    const { title, body, category } = req.body;

    if (!title || !body || !category) {
      return res.status(400).json({ error: 'title, body, and category are required' });
    }

    let image_url = null;
    if (req.file) {
      image_url = await uploadToBlob(req.file.buffer, req.file.originalname, 'communitycont');
    }

    const { rows } = await db.query(
      `INSERT INTO community_posts (author_email, author_name, author_role, category, title, body, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [email, name, role, category, title, body, image_url]
    );
    const post = rows[0];

    // Fire email blast asynchronously — never blocks the response
    if (process.env.ANNOUNCE_EMAIL_NOTIFY === 'true') {
      db.query('SELECT owner_email FROM properties').then(({ rows: props }) => {
        const recipients = props.map(p => p.owner_email).filter(Boolean);
        if (recipients.length) {
          sendCommunityAnnouncement({ authorName: name, authorRole: role, category, title, recipients })
            .catch(err => console.error('Community email blast error:', err));
        }
      });
    }

    res.status(201).json(post);
  } catch (err) {
    console.error('Community POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/community/:id — author or admin only
router.delete('/:id', async (req, res) => {
  try {
    const { email } = await getCallerInfo(req);
    const role       = await getRole(email);

    const { rows } = await db.query(
      'SELECT * FROM community_posts WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    const post = rows[0];

    if (post.author_email !== email && role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed to delete this post' });
    }

    if (post.image_url) {
      await deleteBlob(post.image_url, 'communitycont').catch(() => {});
    }

    await db.query('DELETE FROM community_posts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Community DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

**Step 3: Register the route in `backend/src/index.js`**

Find the block of `app.use` route registrations:
```js
app.use('/api/tenant',     requireAuth(), require('./routes/tenant'));
```
Add the community route immediately after:
```js
app.use('/api/community',  requireAuth(), require('./routes/community'));
```

**Step 4: Manual smoke test**

Start backend (`npm run dev`). Test with curl (replace `<TOKEN>` with a valid Clerk JWT):

```bash
# GET — should return empty array
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/community

# POST — create a post
curl -X POST http://localhost:3001/api/community \
  -H "Authorization: Bearer <TOKEN>" \
  -F "title=Test Announcement" \
  -F "body=This is a test post" \
  -F "category=general"

# GET again — should return the post
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/community
```

**Step 5: Commit**

```bash
git add backend/src/routes/community.js backend/src/index.js backend/.env
git commit -m "feat: add /api/community GET, POST, DELETE routes"
```

---

### Task 4: Frontend API helpers

**Files:**
- Modify: `frontend/src/api.js`

**Step 1: Add three helpers at the bottom of `frontend/src/api.js`**

```js
// Community board
export const getCommunityPosts = async (category = 'all') => {
  const params = category !== 'all' ? `?category=${category}` : '';
  return fetch(`${BASE}/api/community${params}`, {
    headers: await authHeaders(),
  }).then(json);
};

export const createCommunityPost = async (formData) =>
  fetch(`${BASE}/api/community`, {
    method: 'POST',
    headers: await authHeaders(), // no Content-Type — browser sets it with boundary
    body: formData,
  }).then(json);

export const deleteCommunityPost = async (id) =>
  fetch(`${BASE}/api/community/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  }).then(json);
```

**Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add community board API helpers to api.js"
```

---

### Task 5: CommunityBoard shared component

**Files:**
- Create: `frontend/src/components/CommunityBoard.jsx`

**Step 1: Create the file**

```jsx
import { useState, useEffect } from 'react';
import { getCommunityPosts, createCommunityPost, deleteCommunityPost } from '../api';

const CATEGORIES = ['all', 'safety', 'lost_pet', 'wildlife', 'infrastructure', 'hoa_notice', 'general'];

const CATEGORY_LABELS = {
  all:            'All',
  safety:         'Safety',
  lost_pet:       'Lost Pet',
  wildlife:       'Wildlife',
  infrastructure: 'Infrastructure',
  hoa_notice:     'HOA Notice',
  general:        'General',
};

const CATEGORY_STYLES = {
  safety:         'bg-red-100 text-red-700',
  lost_pet:       'bg-orange-100 text-orange-700',
  wildlife:       'bg-yellow-100 text-yellow-800',
  infrastructure: 'bg-purple-100 text-purple-700',
  hoa_notice:     'bg-blue-100 text-blue-700',
  general:        'bg-gray-100 text-gray-600',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CommunityBoard({ currentUserEmail, isAdmin }) {
  const [posts,        setPosts]       = useState([]);
  const [catFilter,    setCatFilter]   = useState('all');
  const [showForm,     setShowForm]    = useState(false);
  const [submitting,   setSubmitting]  = useState(false);
  const [loading,      setLoading]     = useState(true);

  // Form state
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [category, setCategory] = useState('general');
  const [image,    setImage]    = useState(null);

  useEffect(() => {
    setLoading(true);
    getCommunityPosts(catFilter)
      .then(setPosts)
      .catch(err => alert('Failed to load posts: ' + err.message))
      .finally(() => setLoading(false));
  }, [catFilter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('title',    title.trim());
      form.append('body',     body.trim());
      form.append('category', category);
      if (image) form.append('image', image);

      const post = await createCommunityPost(form);
      setPosts(prev => [post, ...prev]);
      setTitle(''); setBody(''); setCategory('general'); setImage(null);
      setShowForm(false);
    } catch (err) {
      alert('Failed to post: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteCommunityPost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                catFilter === c
                  ? 'bg-blue-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition"
        >
          {showForm ? 'Cancel' : '+ New Post'}
        </button>
      </div>

      {/* Compose form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">New Announcement</h3>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={255}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {CATEGORIES.filter(c => c !== 'all').map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <textarea
            placeholder="Describe the situation..."
            value={body}
            onChange={e => setBody(e.target.value)}
            required
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <div>
            <label className="text-xs text-gray-500 block mb-1">Photo (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setImage(e.target.files[0] || null)}
              className="text-sm text-gray-600"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
          >
            {submitting ? 'Posting...' : 'Post Announcement'}
          </button>
        </form>
      )}

      {/* Feed */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No posts yet — be the first to post!</p>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <div key={post.id} className="bg-white border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${CATEGORY_STYLES[post.category]}`}>
                    {CATEGORY_LABELS[post.category]}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{post.author_name}</span>
                  <span className="text-xs text-gray-400">
                    · {post.author_role === 'admin' ? 'HOA Admin' : 'Resident'}
                  </span>
                  <span className="text-xs text-gray-400">· {timeAgo(post.created_at)}</span>
                </div>
                {(post.author_email === currentUserEmail || isAdmin) && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="text-xs text-gray-400 hover:text-red-500 transition flex-shrink-0"
                    title="Delete post"
                  >
                    ✕
                  </button>
                )}
              </div>
              <h4 className="mt-2 font-semibold text-gray-900">{post.title}</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{post.body}</p>
              {post.image_url && (
                <img
                  src={post.image_url}
                  alt="Post photo"
                  className="mt-3 rounded-lg border max-h-64 object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/CommunityBoard.jsx
git commit -m "feat: add CommunityBoard shared component"
```

---

### Task 6: Admin integration — CommunityPage + route + nav link

**Files:**
- Create: `frontend/src/pages/CommunityPage.jsx`
- Modify: `frontend/src/App.jsx`

**Step 1: Create `frontend/src/pages/CommunityPage.jsx`**

```jsx
import { useUser } from '@clerk/clerk-react';
import CommunityBoard from '../components/CommunityBoard';

export default function CommunityPage() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-blue-900 mb-6">Community Board</h1>
      <CommunityBoard currentUserEmail={email} isAdmin={true} />
    </div>
  );
}
```

**Step 2: Add route and nav link in `frontend/src/App.jsx`**

Add the import at the top with the other page imports:
```jsx
import CommunityPage from './pages/CommunityPage';
```

In the admin nav, add a Community link after the existing `<a href="/">` brand link:
```jsx
<nav className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between">
  <div className="flex items-center gap-6">
    <a href="/" className="font-bold text-lg hover:opacity-80">HOA Compliance</a>
    <a href="/community" className="text-sm font-medium hover:opacity-80">Community</a>
  </div>
  <UserButton />
</nav>
```

Add the route inside the `<Routes>` block:
```jsx
<Route path="/community" element={<CommunityPage />} />
```

**Step 3: Commit**

```bash
git add frontend/src/pages/CommunityPage.jsx frontend/src/App.jsx
git commit -m "feat: add /community admin route and nav link"
```

---

### Task 7: Tenant integration — tab switcher in TenantDashboard

**Files:**
- Modify: `frontend/src/pages/TenantDashboard.jsx`

**Step 1: Add import and tab state**

At the top of the file, add the CommunityBoard import:
```jsx
import CommunityBoard from '../components/CommunityBoard';
```

Inside the `TenantDashboard` component function, after the existing `useState` declarations, add:
```jsx
const [activeTab, setActiveTab] = useState('property');
```

**Step 2: Add the tab switcher UI**

Replace the opening `<div className="max-w-3xl mx-auto p-8 space-y-6">` block. Wrap all existing content in a conditional, and add the tab bar:

The complete return should look like this. Replace from the `<div className="max-w-3xl mx-auto p-8 space-y-6">` line to `</div>` (end of that container):

```jsx
<div className="max-w-3xl mx-auto p-8">
  {/* Tab switcher */}
  <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
    <button
      onClick={() => setActiveTab('property')}
      className={`px-5 py-2 text-sm font-semibold rounded-md transition ${
        activeTab === 'property' ? 'bg-white shadow text-blue-900' : 'text-gray-600 hover:text-gray-800'
      }`}
    >
      My Property
    </button>
    <button
      onClick={() => setActiveTab('community')}
      className={`px-5 py-2 text-sm font-semibold rounded-md transition ${
        activeTab === 'community' ? 'bg-white shadow text-blue-900' : 'text-gray-600 hover:text-gray-800'
      }`}
    >
      Community
    </button>
  </div>

  {activeTab === 'property' ? (
    <div className="space-y-6">
      {/* --- paste all existing property/violations/bills JSX sections here unchanged --- */}
    </div>
  ) : (
    <CommunityBoard currentUserEmail={property.owner_email} isAdmin={false} />
  )}
</div>
```

> **Note:** The "paste all existing property/violations/bills JSX sections here unchanged" comment means move the existing Property Header, Open Violations, Pending Review Violations, and Bills `<div>` blocks inside the `activeTab === 'property'` branch. Do not modify their content.

**Step 3: Commit**

```bash
git add frontend/src/pages/TenantDashboard.jsx
git commit -m "feat: add Community tab to TenantDashboard"
```

---

### Task 8: End-to-end verification

**Step 1: Start both servers**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

**Step 2: Admin flow**
1. Log in as admin (`shouryam@uw.edu`)
2. Click "Community" in nav
3. Create a post in each category — verify it appears in the feed
4. Filter by category — verify only matching posts show
5. Delete one of your posts — verify it disappears

**Step 3: Tenant flow**
1. Log in as tenant (`shouryamundra@gmail.com`)
2. Click "Community" tab in TenantDashboard
3. Create a post — verify it appears
4. Switch back to "My Property" — verify violations/bills still show correctly
5. Verify tenant cannot see the delete button on admin's posts

**Step 4: Cross-role visibility**
- Post as admin, verify tenant sees it
- Post as tenant, verify admin sees it with "Resident" label

**Step 5: Optional — test email blast**
Set `ANNOUNCE_EMAIL_NOTIFY=true` in `backend/.env`, restart backend, create a post, and verify SendGrid logs show an outbound email.

**Step 6: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat: community safety module — complete"
```
