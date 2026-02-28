# HOA Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the HOA Compliance Admin Dashboard — admins upload a violation photo, Claude AI writes a formal notice citing the HOA rulebook, and the notice is emailed to the homeowner in one click.

**Architecture:** Hybrid build order — get the core violation loop (upload → AI → email → log) working end-to-end first, then expand to dashboard and property management. Backend is Express + PostgreSQL (Azure) + Azure Blob + Claude API + Resend. Frontend is React + Tailwind + Recharts.

**Tech Stack:** React 18 + Vite + Tailwind CSS + React Router v6 + Recharts | Express.js + pg + multer + @anthropic-ai/sdk + @azure/storage-blob + resend + pdf-parse + uuid

---

## Pre-Flight Checklist (before any coding)

- [ ] Obtain **Anthropic API key** at console.anthropic.com → paste into `backend/.env`
- [ ] Obtain **Resend API key** at resend.com (free tier) → paste into `backend/.env`
- [ ] Confirm Azure PostgreSQL connection string works: `psql "your-connection-string" -c "SELECT 1"`
- [ ] Confirm Azure Blob containers `violations` and `documents` exist with Blob-level public access
- [ ] Paste `AZURE_STORAGE_CONNECTION_STRING` into `backend/.env`

---

## Phase 1 — Foundation

### Task 1: Install Dependencies

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

**Step 1: Install backend packages**
```bash
cd backend && npm install
```
Expected: `node_modules/` created, no errors

**Step 2: Install frontend packages**
```bash
cd frontend && npm install
```
Expected: `node_modules/` created, no errors

**Step 3: Fill in real values in `backend/.env`**

Copy `backend/.env.example` to `backend/.env` and fill in:
- `DATABASE_URL` — your Azure PostgreSQL connection string
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `AZURE_STORAGE_CONNECTION_STRING` — from Azure Portal → Storage Account → Access Keys
- `RESEND_API_KEY` — from resend.com
- `FROM_EMAIL` — a verified sender email in Resend

**Step 4: Commit**
```bash
git add . && git commit -m "chore: scaffold project with all dependencies"
```

---

### Task 2: Database Schema + Seed Data

**Files:**
- Read: `backend/src/db/schema.sql`

**Step 1: Run schema against Azure PostgreSQL**
```bash
psql "postgresql://adminuser:password@your-server.postgres.database.azure.com:5432/hoadb" \
  -f backend/src/db/schema.sql
```
Expected output (in order):
```
CREATE TABLE
CREATE TABLE
INSERT 0 3
INSERT 0 3
UPDATE 1
UPDATE 1
UPDATE 1
```

**Step 2: Verify seed data**
```bash
psql "your-connection-string" -c "SELECT id, address, compliance_score FROM properties;"
```
Expected: 3 rows — 123 Maple (95), 456 Oak (100), 789 Pine (80)

**Step 3: Commit**
```bash
git add backend/src/db/schema.sql && git commit -m "feat: add database schema and seed data"
```

---

### Task 3: Verify Backend Server Starts

**Files:**
- Read: `backend/src/index.js`
- Read: `backend/src/db/index.js`

**Step 1: Start the backend**
```bash
cd backend && npm run dev
```
Expected: `Backend running on port 3001`

**Step 2: Hit the health check**
```bash
curl http://localhost:3001/health
```
Expected: `{"ok":true}`

**Step 3: Commit**
```bash
git commit -m "feat: backend server and db connection confirmed working"
```

---

## Phase 2 — Core Services

### Task 4: Smoke-Test Azure Blob Upload

**Files:**
- Read: `backend/src/services/azure.js`

**Step 1: Create a temporary test script**
```bash
cat > backend/test-azure.js << 'EOF'
require('dotenv').config();
const { uploadToBlob } = require('./src/services/azure');
const fs = require('fs');
// Put any .jpg file in backend/ for this test
const buf = fs.readFileSync('./test.jpg');
uploadToBlob(buf, 'test.jpg', 'violations')
  .then(url => { console.log('✓ Upload OK:', url); process.exit(0); })
  .catch(e => { console.error('✗ FAIL:', e.message); process.exit(1); });
EOF
```

**Step 2: Add a test image and run**
```bash
cd backend && node test-azure.js
```
Expected: `✓ Upload OK: https://youraccount.blob.core.windows.net/violations/xxxx.jpg`

If this fails: check `AZURE_STORAGE_CONNECTION_STRING` in `.env` and verify the `violations` container exists with public access.

**Step 3: Clean up**
```bash
rm backend/test-azure.js backend/test.jpg
```

---

### Task 5: Smoke-Test Claude API

**Files:**
- Read: `backend/src/services/claude.js`

**Step 1: Create a temporary test script**
```bash
cat > backend/test-claude.js << 'EOF'
require('dotenv').config();
const { analyzeViolation, DEFAULT_HOA_RULES } = require('./src/services/claude');
const fs = require('fs');
const buf = fs.readFileSync('./test.jpg');
analyzeViolation(buf, 'image/jpeg', DEFAULT_HOA_RULES, 'trash bins visible')
  .then(r => { console.log('✓ Claude OK:', JSON.stringify(r, null, 2)); process.exit(0); })
  .catch(e => { console.error('✗ FAIL:', e.message); process.exit(1); });
EOF
```

**Step 2: Add a test image and run**
```bash
cd backend && node test-claude.js
```
Expected: JSON with `violation_detected`, `category`, `severity`, `description`, `rule_cited`, `remediation`, `deadline_days`

**Step 3: Clean up**
```bash
rm backend/test-claude.js
```

---

## Phase 3 — Core Loop Backend

### Task 6: Test POST /api/violations/analyze

**Files:**
- Read: `backend/src/routes/violations.js`
- Read: `backend/src/index.js`

**Step 1: Start the backend (if not already running)**
```bash
cd backend && npm run dev
```

**Step 2: Hit the analyze endpoint with curl**
```bash
curl -X POST http://localhost:3001/api/violations/analyze \
  -F "file=@/path/to/any/photo.jpg" \
  -F "property_id=1" \
  -F "hint=trash bins visible"
```
Expected: JSON with `image_url` (Azure blob URL) + all Claude analysis fields

**Step 3: Commit**
```bash
git commit -m "feat: verify violation analyze route works end-to-end"
```

---

### Task 7: Test POST /api/violations (save + email)

**Files:**
- Read: `backend/src/routes/violations.js`

**Step 1: Save a violation without sending email**
```bash
curl -X POST http://localhost:3001/api/violations \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": 1,
    "image_url": "https://placeholder.com/test.jpg",
    "category": "garbage",
    "severity": "low",
    "description": "Trash bins visible from street.",
    "rule_cited": "Section 4.2",
    "remediation": "Move bins out of sight.",
    "deadline_days": 7,
    "send_email": false
  }'
```
Expected: JSON with new violation `id` and `status: "open"`

**Step 2: Verify in DB**
```bash
psql "your-connection-string" -c "SELECT id, category, severity, status FROM violations ORDER BY id DESC LIMIT 1;"
```

**Step 3: Test resolve**
```bash
# Replace 4 with the id returned above
curl -X PATCH http://localhost:3001/api/violations/4/resolve
```
Expected: `{"status":"resolved","resolved_at":"..."}`

**Step 4: Commit**
```bash
git commit -m "feat: verify save violation and resolve routes"
```

---

### Task 8: Test Properties + Dashboard Routes

**Files:**
- Read: `backend/src/routes/properties.js`
- Read: `backend/src/routes/dashboard.js`

**Step 1: Test all three reads**
```bash
curl http://localhost:3001/api/properties
curl http://localhost:3001/api/properties/1
curl http://localhost:3001/api/dashboard/violations-timeline
```
Expected:
- First: array of 3 properties with `open_violations` count
- Second: single property with nested `violations` array
- Third: array of all violations with `property_address`

**Step 2: Commit**
```bash
git commit -m "feat: verify all backend routes working"
```

---

## ⭐ Backend complete. Now build the frontend.

---

## Phase 4 — Core Loop Frontend

### Task 9: Verify React Router + Frontend Starts

**Files:**
- Read: `frontend/src/App.jsx`
- Read: `frontend/src/main.jsx`

**Step 1: Start the frontend**
```bash
cd frontend && npm run dev
```
Expected: `Local: http://localhost:5173/`

**Step 2: Test routing**
- Navigate to `http://localhost:5173/` — should show Dashboard heading
- Navigate to `http://localhost:5173/properties/1` — should show Property Detail heading
- Navigate to `http://localhost:5173/properties/1/violations/new` — should show Violation Form heading

**Step 3: Commit**
```bash
git commit -m "feat: verify frontend routing works"
```

---

### Task 10: Test ViolationForm End-to-End (Core Loop Complete)

**Files:**
- Read: `frontend/src/pages/ViolationForm.jsx`
- Read: `frontend/src/api.js`

**Step 1: Navigate to the violation form**
Open `http://localhost:5173/properties/1/violations/new`

**Step 2: Upload a photo and analyze**
1. Click the upload zone → select any property photo
2. Optionally type a hint like "overgrown lawn"
3. Click "Analyze Photo"
4. Wait 3–8 seconds for Claude
5. Form should pre-fill with: category, severity, description, rule cited, remediation, deadline

**Step 3: Submit the violation**
1. Review the pre-filled fields (edit if needed)
2. Click "Save Without Sending" first (avoids test email)
3. Should navigate to `/properties/1`
4. Verify in DB: `SELECT * FROM violations ORDER BY id DESC LIMIT 1;`

**Step 4: Test email send**
1. Go back to `/properties/1/violations/new`
2. Upload another photo, analyze
3. Click "Send Notice & Save"
4. Check the homeowner's email inbox

**Step 5: Commit**
```bash
git commit -m "feat: core violation loop verified end-to-end"
```

---

## ⭐ CORE LOOP VERIFIED. Expand to full dashboard.

---

## Phase 5 — Full Dashboard

### Task 11: Test Dashboard Screen

**Files:**
- Read: `frontend/src/pages/Dashboard.jsx`
- Read: `frontend/src/components/PropertyCard.jsx`
- Read: `frontend/src/components/ViolationsTimeline.jsx`
- Read: `frontend/src/components/ComplianceScore.jsx`

**Step 1: Navigate to `http://localhost:5173/`**

Verify:
- [ ] 3 property cards loaded from DB
- [ ] Compliance score badges correct colors (95 = green, 80 = orange/yellow)
- [ ] Violations timeline scatter chart visible with 3 dots
- [ ] Search bar filters properties by name/address
- [ ] Clicking a card navigates to `/properties/:id`

**Step 2: Add a property**
1. Click "+ Add Property"
2. Fill in address, owner name, email
3. Submit
4. New card should appear in the list

**Step 3: Delete the test property**
1. Hover over the new card
2. Click "Delete" (appears on hover)
3. Confirm deletion
4. Card should disappear

**Step 4: Commit**
```bash
git commit -m "feat: dashboard screen verified"
```

---

### Task 12: Test Property Detail Screen

**Files:**
- Read: `frontend/src/pages/PropertyDetail.jsx`
- Read: `frontend/src/components/ViolationRow.jsx`

**Step 1: Navigate to `http://localhost:5173/properties/1`**

Verify:
- [ ] Address, owner info, phone, resident since shown
- [ ] Large compliance score circle (95, green)
- [ ] 2 violations in table (1 open garbage, 1 resolved lawn)
- [ ] "Mark Resolved" button on the open garbage violation
- [ ] "Report Violation" button navigates to Screen 3

**Step 2: Mark a violation resolved**
1. Click "Mark Resolved" on the open garbage violation
2. Row status should change to "resolved"
3. Compliance score should update to 100
4. Verify in DB: `SELECT compliance_score FROM properties WHERE id = 1;`

**Step 3: Upload HOA Rules PDF**
1. Click "Upload HOA Rules PDF"
2. Select `resources/Example HOA Agreement.pdf`
3. Should show success toast
4. Re-analyze a violation — Claude should now use the PDF rules instead of defaults

**Step 4: Commit**
```bash
git commit -m "feat: property detail screen verified"
```

---

### Task 13: Final End-to-End Walkthrough

Complete this full checklist as a demo rehearsal:

- [ ] Dashboard loads with 3 properties + scatter chart
- [ ] Search filters correctly
- [ ] Click 123 Maple St → property detail loads
- [ ] Upload `resources/Example HOA Agreement.pdf` → "PDF updated" confirmation
- [ ] Click "Report Violation" → violation form loads
- [ ] Upload photo + hint → AI analyzes (3–8s) → form pre-fills
- [ ] Edit a field to confirm editability
- [ ] Click "Send Notice & Save" → email delivered, navigated back
- [ ] New violation appears in table, score updated
- [ ] Click "Mark Resolved" → score goes back up
- [ ] Add new property → appears in dashboard
- [ ] Delete that property → gone from dashboard

**Step: Final commit**
```bash
git add -A && git commit -m "feat: HOA compliance dashboard MVP complete"
```

---

## API Keys Needed Before Starting

| Key | Where | `.env` variable |
|-----|-------|-----------------|
| Anthropic API key | console.anthropic.com | `ANTHROPIC_API_KEY` |
| Resend API key | resend.com | `RESEND_API_KEY` |
| Verified sender email | resend.com | `FROM_EMAIL` |

Azure is already set up — just copy the connection string.

## Build Order Summary

```
Phase 1: Foundation
  Task 1: Install dependencies
  Task 2: Run DB schema + seed data
  Task 3: Verify backend starts + health check

Phase 2: Core Services
  Task 4: Smoke-test Azure blob upload
  Task 5: Smoke-test Claude AI

Phase 3: Core Loop Backend
  Task 6: Test POST /api/violations/analyze
  Task 7: Test POST /api/violations + resolve
  Task 8: Test properties + dashboard routes

Phase 4: Core Loop Frontend  ← ⭐ Core loop verified here
  Task 9: Verify React Router
  Task 10: Test ViolationForm end-to-end

Phase 5: Full Dashboard
  Task 11: Test Dashboard screen
  Task 12: Test Property Detail screen
  Task 13: Final walkthrough
```
