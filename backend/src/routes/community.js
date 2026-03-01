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

// GET /api/community/unread-count?since=<ISO timestamp>
router.get('/unread-count', async (req, res) => {
  try {
    const { since } = req.query;
    const cutoff = since ? new Date(since) : new Date(0);
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS count FROM community_posts WHERE created_at > $1',
      [cutoff]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('Community unread-count error:', err);
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
