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
app.use('/api/tenant',     requireAuth(), require('./routes/tenant'));

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
