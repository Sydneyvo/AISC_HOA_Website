# HOA Admin Dashboard — Technical Specification
**Version:** 2.0 | **Stack:** React + Express.js + PostgreSQL + Claude API + Azure Blob Storage + Resend

---

## Table of Contents
1. [What We're Building](#1-what-were-building)
2. [Database Schema](#2-database-schema-postgresql)
3. [API Routes](#3-api-routes)
4. [Folder & File Structure](#4-folder--file-structure)
5. [Environment Variables](#5-environment-variables)
6. [The Claude AI Prompt](#6-the-claude-ai-prompt)
7. [Azure Blob Image Upload](#7-azure-blob-image-upload)
8. [The Email Template](#8-the-email-template)
9. [Screen-by-Screen Breakdown](#9-screen-by-screen-breakdown)
10. [Data Flow: Full Violation Walkthrough](#10-data-flow-full-violation-walkthrough)
11. [Compliance Score Formula](#11-compliance-score-formula)
12. [Open Questions](#12-open-questions)

---

## 1. What We're Building

Three screens, one core loop:

```
[Screen 1: Dashboard — all properties + community violations graph]
  → Click a property →
[Screen 2: Property Detail — property info + violation history table]
  → Click "Report Violation" →
[Screen 3: Violation Form — upload photo → AI fills form → send email]
```

---

## 2. Database Schema (PostgreSQL)

### Why Two Separate Tables (Not Embedded)

Your sketch had the right instinct — a "compliance tracker" lives under each property. But in SQL, you **never store a list of things inside a row**. Instead, violations live in their own table and each violation row has a `property_id` column that points back to which property it belongs to. This is called a **foreign key**.

Think of it like this:

```
properties table                    violations table
─────────────────────               ─────────────────────────────────────
id │ address        │ score         id │ property_id │ category │ status
───┼────────────────┼──────         ───┼─────────────┼──────────┼───────
 1 │ 123 Maple St   │  80            1 │      1      │ garbage  │ open      ← belongs to property 1
 2 │ 456 Oak Ave    │ 100            2 │      1      │ lawn     │ resolved  ← also property 1
 3 │ 789 Pine Rd    │  65            3 │      3      │ parking  │ open      ← belongs to property 3
```

To get all violations for 123 Maple St (id=1), you run:
```sql
SELECT * FROM violations WHERE property_id = 1;
```

That's it. One line. You never need to put violations inside the properties row. This is the standard, correct, and efficient way to do this in any relational database.

---

### Table 1: `properties`

```sql
CREATE TABLE properties (
  id               SERIAL PRIMARY KEY,
  address          VARCHAR(255) NOT NULL,
  owner_name       VARCHAR(255) NOT NULL,
  owner_email      VARCHAR(255) NOT NULL,
  owner_phone      VARCHAR(50),
  resident_since   INTEGER,              -- year they moved in, e.g. 2019
  compliance_score INTEGER DEFAULT 100, -- 0–100, recalculated automatically
  created_at       TIMESTAMP DEFAULT NOW()
);
```

### Table 2: `violations`

```sql
CREATE TABLE violations (
  id             SERIAL PRIMARY KEY,
  property_id    INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Violation details (AI-generated, admin-editable)
  category       VARCHAR(100) NOT NULL,
  severity       VARCHAR(10)  NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description    TEXT         NOT NULL,
  rule_cited     TEXT,
  remediation    TEXT,
  deadline_days  INTEGER DEFAULT 14,

  -- Status
  status         VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved')),

  -- Image (stored in Azure Blob, we save the public URL)
  image_url      TEXT,

  -- Timestamps
  notice_sent_at TIMESTAMP,  -- set when email is sent
  resolved_at    TIMESTAMP,  -- set when admin marks resolved
  created_at     TIMESTAMP DEFAULT NOW()
);
```

> `ON DELETE CASCADE` means: if you ever delete a property, all its violations are automatically deleted too. This prevents orphaned records.

### Violation Categories

```
parking    → Unauthorized vehicle, RV, boat in driveway
garbage    → Trash bins visible from street, improper disposal
lawn       → Overgrown grass, dead landscaping, weeds
exterior   → Peeling paint, broken shutters, damaged fence
structure  → Unapproved shed, pergola, or modification
other      → Catch-all
```

### Seed Data (paste this into your DB to have demo data immediately)

```sql
INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since)
VALUES
  ('123 Maple Street', 'John Smith',    'john@example.com',  '555-0101', 2018),
  ('456 Oak Avenue',   'Maria Garcia',  'maria@example.com', '555-0102', 2021),
  ('789 Pine Road',    'David Lee',     'david@example.com', '555-0103', 2015);

INSERT INTO violations (property_id, category, severity, description, rule_cited, remediation, status, created_at)
VALUES
  (1, 'garbage',  'low',    'Trash bins visible from street.',           'Section 4.2', 'Store bins out of view.',       'open',     NOW() - INTERVAL '10 days'),
  (1, 'lawn',     'medium', 'Grass exceeds 6 inches in front yard.',     'Section 3.1', 'Mow lawn to under 6 inches.',   'resolved', NOW() - INTERVAL '60 days'),
  (3, 'parking',  'high',   'Boat on trailer parked in driveway >24hr.', 'Section 5.1', 'Remove or store off-property.', 'open',     NOW() - INTERVAL '3 days');

-- Update scores to match seed violations
UPDATE properties SET compliance_score = 95  WHERE id = 1;  -- 1 low open
UPDATE properties SET compliance_score = 100 WHERE id = 2;  -- no violations
UPDATE properties SET compliance_score = 80  WHERE id = 3;  -- 1 high open
```

---

## 3. API Routes

All routes prefixed with `/api`.

### Properties

| Method | Route | What it does | Body | Response |
|---|---|---|---|---|
| `GET` | `/api/properties` | All properties + open violation count, sorted by score | — | `Property[]` |
| `GET` | `/api/properties/:id` | One property + its full violations list | — | `Property & { violations: Violation[] }` |
| `POST` | `/api/properties` | Create a new property | `{ address, owner_name, owner_email, owner_phone, resident_since }` | New `Property` |

### Violations

| Method | Route | What it does | Body | Response |
|---|---|---|---|---|
| `POST` | `/api/violations/analyze` | Upload image → Azure Blob → Claude analysis | `multipart/form-data: { file, property_id, hint? }` | `{ image_url, category, severity, description, rule_cited, remediation, deadline_days }` |
| `POST` | `/api/violations` | Save reviewed violation + send email | JSON (see below) | New `Violation` |
| `PATCH` | `/api/violations/:id/resolve` | Mark resolved, update score | — | Updated `Violation` |

### Dashboard Endpoint (for the graph)

| Method | Route | What it does | Response |
|---|---|---|---|
| `GET` | `/api/dashboard/violations-timeline` | All violations across all properties with date + severity | `{ date, severity, property_address, category }[]` |

This dedicated endpoint powers the community-wide graph on Screen 1. It returns every violation ever logged, with enough info to plot and color each dot.

---

### Detailed Request/Response Shapes

#### `POST /api/violations/analyze` — multipart form upload

```
// Request (multipart/form-data — NOT JSON)
file:        <image file from the browser>
property_id: "1"
hint:        "trash bins visible from street"  (optional)

// Response (JSON)
{
  "image_url":    "https://yourblob.blob.core.windows.net/violations/abc123.jpg",
  "category":     "garbage",
  "severity":     "low",
  "description":  "Trash bins are visible from the street on a non-collection day.",
  "rule_cited":   "Section 4.2 — Refuse containers must be stored out of street view.",
  "remediation":  "Move trash bins to the side yard or garage.",
  "deadline_days": 7,
  "violation_detected": true
}
```

The backend does three things in this one call:
1. Receives the image file via multer
2. Uploads it to Azure Blob Storage → gets the public URL
3. Passes the image as base64 to Claude API → gets the analysis JSON
4. Returns both the `image_url` AND the analysis together

The frontend stores the `image_url` from this response. When the admin submits the reviewed form, it sends that URL — no re-upload needed.

---

#### `POST /api/violations` — save + send email

```javascript
// Request (JSON)
{
  "property_id":  1,
  "image_url":    "https://yourblob.blob.core.windows.net/violations/abc123.jpg",
  "category":     "garbage",
  "severity":     "low",
  "description":  "Trash bins are visible from the street on a non-collection day.",
  "rule_cited":   "Section 4.2 — Refuse containers must be stored out of street view.",
  "remediation":  "Move trash bins to the side yard or garage.",
  "deadline_days": 7,
  "send_email":   true    // false = save as draft, no email sent
}

// Response (JSON)
{
  "id":             42,
  "property_id":    1,
  "status":         "open",
  "notice_sent_at": "2026-02-28T14:32:00Z",
  "image_url":      "https://yourblob.blob.core.windows.net/violations/abc123.jpg",
  ...
}
```

---

## 4. Folder & File Structure

```
hoa-dashboard/
│
├── frontend/                          ← Lovable-generated React app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx          ← Screen 1: properties list + community graph
│   │   │   ├── PropertyDetail.jsx     ← Screen 2: property info + violations table
│   │   │   └── ViolationForm.jsx      ← Screen 3: upload photo + review AI form
│   │   ├── components/
│   │   │   ├── PropertyCard.jsx       ← Individual card in the properties list
│   │   │   ├── ViolationRow.jsx       ← Row in the violation history table
│   │   │   ├── ComplianceScore.jsx    ← Colored score badge (green/yellow/red)
│   │   │   └── ViolationsTimeline.jsx ← The scatter chart (see Section 9)
│   │   ├── api.js                     ← All fetch() calls live here — see below
│   │   └── App.jsx
│   ├── .env
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── properties.js          ← GET /api/properties, GET /api/properties/:id, POST
│   │   │   ├── violations.js          ← POST /analyze, POST /, PATCH /:id/resolve
│   │   │   └── dashboard.js           ← GET /api/dashboard/violations-timeline
│   │   ├── services/
│   │   │   ├── claude.js              ← Claude API call (image → JSON analysis)
│   │   │   ├── azure.js               ← Azure Blob upload (file buffer → public URL)
│   │   │   └── email.js               ← Resend email (property + violation → sends notice)
│   │   ├── db/
│   │   │   ├── index.js               ← PostgreSQL connection pool
│   │   │   └── schema.sql             ← CREATE TABLE statements from Section 2
│   │   └── index.js                   ← Express app, registers routes, starts server
│   ├── .env
│   └── package.json
│
├── .gitignore
└── README.md
```

### `frontend/src/api.js` — all backend calls in one place

```javascript
const BASE = import.meta.env.VITE_API_URL;

// Screen 1
export const getProperties = () =>
  fetch(`${BASE}/api/properties`).then(r => r.json());

export const getViolationsTimeline = () =>
  fetch(`${BASE}/api/dashboard/violations-timeline`).then(r => r.json());

// Screen 2
export const getProperty = (id) =>
  fetch(`${BASE}/api/properties/${id}`).then(r => r.json());

export const resolveViolation = (id) =>
  fetch(`${BASE}/api/violations/${id}/resolve`, { method: 'PATCH' }).then(r => r.json());

// Screen 3 — uses FormData (NOT JSON) because we're uploading a file
export const analyzeViolation = (file, propertyId, hint = '') => {
  const form = new FormData();
  form.append('file', file);               // the actual image File object
  form.append('property_id', propertyId);
  form.append('hint', hint);
  return fetch(`${BASE}/api/violations/analyze`, {
    method: 'POST',
    body: form                             // no Content-Type header — browser sets it automatically
  }).then(r => r.json());
};

export const submitViolation = (data) =>
  fetch(`${BASE}/api/violations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json());

export const createProperty = (data) =>
  fetch(`${BASE}/api/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json());
```

> **Why FormData for the analyze call?** Because you're uploading an actual file (binary image data), not plain text. JSON can't carry binary files. `FormData` is the standard way browsers send file uploads. You do NOT set a `Content-Type` header — the browser sets it automatically with the correct `multipart/form-data` boundary string.

---

## 5. Environment Variables

### Backend `.env`
```bash
# PostgreSQL (Azure Database for PostgreSQL)
DATABASE_URL=postgresql://adminuser:password@your-server.postgres.database.azure.com:5432/hoadb

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...
AZURE_BLOB_CONTAINER_NAME=violations

# Resend Email
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourhoa.com

# Server
PORT=3001
FRONTEND_URL=http://localhost:5173   # used for CORS — change to deployed URL later
```

### Frontend `.env`
```bash
VITE_API_URL=http://localhost:3001   # change to Azure App Service URL after deploy
```

### Backend `package.json` dependencies to install
```bash
npm install express pg dotenv @anthropic-ai/sdk resend multer @azure/storage-blob cors
```

- `multer` — handles multipart file uploads in Express
- `@azure/storage-blob` — Azure's official Node.js SDK
- `cors` — allows the Lovable frontend (different port/domain) to call the backend

---

## 6. The Claude AI Prompt

Lives in `backend/src/services/claude.js`. This receives the raw image buffer, converts it to base64, and calls Claude.

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();  // automatically reads ANTHROPIC_API_KEY from env

// Replace this with your actual HOA rules document
const HOA_RULES = `
MAPLE GROVE HOA — COMMUNITY RULES

Section 3.1 — Lawn & Landscaping
Grass must not exceed 6 inches. Dead plants and weeds must be cleared within 14 days of notice.

Section 4.2 — Refuse & Recycling
Trash containers must be stored out of street view at all times except on collection day.
Bins must be returned by 8pm on collection day.

Section 5.1 — Vehicles & Parking
No RVs, boats, trailers, or commercial vehicles may be parked in driveways for more than 24 hours.

Section 6.3 — Exterior Maintenance
Homes must be kept in good repair: paint, gutters, shutters, fencing, driveways.
Visible damage must be repaired within 30 days of notice.

Section 7.1 — Unapproved Structures
No shed, pergola, fence, or permanent structure may be added without prior HOA board approval.
`;

const VALID_CATEGORIES = ['parking', 'garbage', 'lawn', 'exterior', 'structure', 'other'];

async function analyzeViolation(imageBuffer, mimeType = 'image/jpeg', hint = '') {
  const base64Image = imageBuffer.toString('base64');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an HOA compliance assistant. Analyze property photos for rule violations 
based on the HOA rulebook below.

Respond with ONLY a valid JSON object — no explanation, no markdown fences, just raw JSON.

Required fields:
{
  "violation_detected": true or false,
  "category": one of [${VALID_CATEGORIES.join(', ')}] or null,
  "severity": "low", "medium", or "high" — or null if no violation,
  "description": "2-3 sentence plain English description of what you see",
  "rule_cited": "Section X.X — exact rule text" or null,
  "remediation": "Specific steps the homeowner must take" or null,
  "deadline_days": 7 for minor, 14 for standard, 30 for major — or null
}

Severity guide:
- low: minor, easy to fix, no structural concern (e.g. trash bin out)
- medium: ongoing neglect, visible from street (e.g. overgrown lawn)
- high: structural, safety, or major rule violation (e.g. unapproved structure)

HOA RULEBOOK:
${HOA_RULES}`,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64Image }
        },
        {
          type: 'text',
          text: hint
            ? `Analyze this property photo for HOA violations. Admin note: "${hint}"`
            : 'Analyze this property photo for HOA violations.'
        }
      ]
    }]
  });

  const text = response.content[0].text.trim();
  return JSON.parse(text);
}

module.exports = { analyzeViolation };
```

---

## 7. Azure Blob Image Upload

Lives in `backend/src/services/azure.js`.

```javascript
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');  // npm install uuid

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

async function uploadViolationImage(fileBuffer, originalFilename) {
  const containerClient = blobServiceClient.getContainerClient(
    process.env.AZURE_BLOB_CONTAINER_NAME  // "violations"
  );

  // Generate a unique filename so nothing ever gets overwritten
  const extension = originalFilename.split('.').pop();           // e.g. "jpg"
  const blobName = `${uuidv4()}.${extension}`;                   // e.g. "f3a9b2c1-....jpg"

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
    blobHTTPHeaders: { blobContentType: `image/${extension}` }
  });

  // Return the public URL — make sure "violations" container has public blob access
  return blockBlobClient.url;
}

module.exports = { uploadViolationImage };
```

### How the analyze route uses both services

```javascript
// backend/src/routes/violations.js (the /analyze route)
const multer = require('multer');
const { analyzeViolation } = require('../services/claude');
const { uploadViolationImage } = require('../services/azure');

const upload = multer({ storage: multer.memoryStorage() }); // keep file in memory, not disk

router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const { property_id, hint } = req.body;
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;       // e.g. "image/jpeg"
    const originalName = req.file.originalname;

    // Step 1: Upload to Azure Blob, get back the public URL
    const image_url = await uploadViolationImage(fileBuffer, originalName);

    // Step 2: Send to Claude for analysis
    const analysis = await analyzeViolation(fileBuffer, mimeType, hint || '');

    // Return both together — frontend stores image_url for the final submit step
    res.json({ image_url, ...analysis });

  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});
```

### Azure Setup Steps (for Person 4)

1. In the Azure Portal, create a **Storage Account** under your student subscription
2. Inside it, create a **Blob Container** named `violations`
3. Set the container's **Access Level** to "Blob (anonymous read access for blobs only)" — this makes images publicly accessible via URL so they can appear in emails
4. Copy the **Connection String** from the Storage Account → Access Keys section
5. Paste it into the backend `.env` as `AZURE_STORAGE_CONNECTION_STRING`

---

## 8. The Email Template

Lives in `backend/src/services/email.js`.

```javascript
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const severityConfig = {
  low:    { color: '#16a34a', label: 'LOW',    border: '#bbf7d0' },
  medium: { color: '#d97706', label: 'MEDIUM', border: '#fde68a' },
  high:   { color: '#dc2626', label: 'HIGH',   border: '#fecaca' }
};

async function sendViolationNotice({ property, violation }) {
  const sev = severityConfig[violation.severity] || severityConfig.low;

  const deadline = new Date(violation.created_at || Date.now());
  deadline.setDate(deadline.getDate() + violation.deadline_days);
  const deadlineStr = deadline.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">

      <div style="background:#1e3a5f;padding:24px 32px;color:white;">
        <h1 style="margin:0;font-size:20px;font-weight:bold;">HOA Compliance Notice</h1>
        <p style="margin:6px 0 0;opacity:0.75;font-size:14px;">
          ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>

      <div style="padding:28px 32px;background:#f9fafb;">
        <p style="margin:0 0 8px;">Dear <strong>${property.owner_name}</strong>,</p>
        <p style="margin:0 0 20px;">A compliance issue has been identified at:</p>
        <p style="margin:0 0 24px;font-size:16px;font-weight:bold;color:#1e3a5f;">${property.address}</p>

        <div style="background:white;border:1px solid ${sev.border};border-left:4px solid ${sev.color};padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.05em;">Violation</p>
          <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#111827;">
            ${violation.category.charAt(0).toUpperCase() + violation.category.slice(1)}
          </p>
          <span style="background:${sev.color};color:white;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:999px;">
            ${sev.label} SEVERITY
          </span>
        </div>

        <h3 style="margin:0 0 8px;color:#1e3a5f;">What Was Observed</h3>
        <p style="margin:0 0 20px;color:#374151;">${violation.description}</p>

        ${violation.rule_cited ? `
        <h3 style="margin:0 0 8px;color:#1e3a5f;">Applicable Rule</h3>
        <p style="margin:0 0 20px;background:white;border:1px solid #e5e7eb;padding:12px 16px;border-radius:6px;font-style:italic;color:#374151;">
          ${violation.rule_cited}
        </p>` : ''}

        <h3 style="margin:0 0 8px;color:#1e3a5f;">Required Action</h3>
        <p style="margin:0 0 20px;color:#374151;">${violation.remediation}</p>

        <div style="background:#fffbeb;border:1px solid #fbbf24;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0;font-weight:bold;color:#92400e;">
            ⏱ Resolution Deadline: ${deadlineStr}
          </p>
          <p style="margin:6px 0 0;color:#92400e;font-size:14px;">
            Please address this within ${violation.deadline_days} days of this notice date.
          </p>
        </div>

        ${violation.image_url ? `
        <h3 style="margin:0 0 8px;color:#1e3a5f;">Photo on File</h3>
        <img src="${violation.image_url}" alt="Violation photo"
          style="max-width:100%;border-radius:6px;border:1px solid #e5e7eb;margin-bottom:24px;" />
        ` : ''}

        <p style="color:#374151;">
          If you have questions or believe this notice was sent in error, please contact the HOA office.
        </p>
        <p style="color:#374151;">Thank you for your cooperation.</p>
        <p style="font-weight:bold;color:#1e3a5f;">HOA Management</p>
      </div>

      <div style="padding:16px 32px;background:#f3f4f6;text-align:center;font-size:12px;color:#6b7280;">
        This is an official notice from your Homeowners Association.
      </div>
    </div>
  `;

  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: property.owner_email,
    subject: `HOA Compliance Notice — ${property.address}`,
    html
  });
}

module.exports = { sendViolationNotice };
```

---

## 9. Screen-by-Screen Breakdown

### Screen 1: Properties Dashboard (`/`)

This is the command center. The admin sees the health of the entire community at a glance.

**Layout — two sections stacked:**

**Top: Community Violations Timeline (the graph)**

A scatter plot showing every violation ever logged across all properties, on a single timeline.

```
# Violations Timeline — All Properties

●  ●        ●              ●     ●    ●
        ●        ●    ●              ●
──────────────────────────────────────────→ time
Jan       Mar       Jun       Sep       Dec

● = high severity (red)
● = medium severity (orange)  
● = low severity (green)
```

- **X-axis:** date (by month or week depending on data density)
- **Y-axis:** not needed — all dots sit on the same horizontal band, spaced by date. This is a timeline/strip chart, not a bar chart.
- **Each dot:** one violation. Hovering shows: property address, category, date, status (open/resolved)
- **Color:** red = high, orange = medium, green = low
- **Implementation:** Use [Recharts](https://recharts.org) `ScatterChart`. X is `new Date(v.created_at).getTime()`, Y is always `1` (or randomize slightly to avoid overlap). Color each dot with a custom `shape` prop.

**Data source:** `GET /api/dashboard/violations-timeline`

```javascript
// What the endpoint returns
[
  { id: 1, created_at: "2026-01-10T...", severity: "low",    category: "garbage", property_address: "123 Maple St", status: "resolved" },
  { id: 3, created_at: "2026-02-25T...", severity: "high",   category: "parking", property_address: "789 Pine Rd",  status: "open"     },
  ...
]
```

---

**Bottom: Properties List**

- Search bar and sort dropdown (by score, by open violations)
- A card grid. Each card shows:
  - Address
  - Owner name
  - Compliance score badge — green (≥80), yellow (50–79), red (<50)
  - Number of open violations
  - Date of most recent violation
  - "View" button → navigates to Screen 2

---

### Screen 2: Property Detail (`/properties/:id`)

Focused view on a single property.

**Header section:**
- Address (large), owner name, email, phone, resident since
- Large compliance score circle — color matches score range
- "Report Violation" button (primary, prominent)

**Violations History Table:**

| Date | Category | Severity | Description | Status | Action |
|---|---|---|---|---|---|
| Feb 28 | Garbage | 🟢 Low | Bins visible from street | Open | Mark Resolved |
| Jan 12 | Lawn | 🟠 Medium | Grass over 6 inches | Resolved | — |

- Severity shown as a colored pill
- "Mark Resolved" button calls `PATCH /api/violations/:id/resolve`

**What loads:** `GET /api/properties/:id` — returns the property row joined with all its violations.

---

### Screen 3: Violation Form (`/properties/:id/violations/new`)

Two-state screen.

**State A — Upload**
- Property address shown at top (admin sees which property they're filing for)
- Drag-and-drop image upload zone
- Optional hint field: "Briefly describe what you see (helps the AI)"
- "Analyze Photo" button

**State B — Review (after AI responds)**
- Photo preview on the left
- Pre-filled form on the right (all fields editable by admin):
  - Category (dropdown)
  - Severity (Low / Medium / High segmented control)
  - Description (textarea)
  - Rule Cited (textarea)
  - Remediation Steps (textarea)
  - Deadline in days (number input)
- "Send Notice & Save" button → saves + emails homeowner
- "Save Without Sending" button → saves, no email
- "Re-analyze" link → go back to State A

**Loading state (between A and B):**
Spinner + "Analyzing photo with AI..." message. Claude typically takes 3–8 seconds.

---

## 10. Data Flow: Full Violation Walkthrough

```
Step 1 — Admin opens Screen 3
  Navigates to /properties/1/violations/new
  Frontend shows the upload zone

Step 2 — Admin selects photo
  Browser File object is ready in React state
  Admin optionally types: "trash bins visible from driveway"
  Admin clicks "Analyze Photo"

Step 3 — Frontend calls POST /api/violations/analyze
  Uses FormData (not JSON) — appends: file, property_id, hint
  Shows loading spinner

Step 4 — Backend /analyze route runs
  multer extracts file → buffer in memory
  Calls uploadViolationImage(buffer, filename) → Azure Blob → returns public URL
  Calls analyzeViolation(buffer, mimeType, hint) → Claude API → returns JSON
  Returns: { image_url, category, severity, description, rule_cited, remediation, deadline_days }

Step 5 — Frontend populates form (State B)
  Stores image_url in React state
  Fills all form fields from Claude JSON
  Admin reviews, edits anything needed

Step 6 — Admin clicks "Send Notice & Save"
  Frontend calls POST /api/violations (JSON body)
  Body includes: all form fields + the image_url from Step 4

Step 7 — Backend saves violation + sends email
  INSERT INTO violations (...) → gets new violation id
  SELECT * FROM properties WHERE id = $1 → get owner_name, owner_email for email
  Calls sendViolationNotice({ property, violation }) → Resend fires the email
  UPDATE violations SET notice_sent_at = NOW() WHERE id = $newId
  Recalculates compliance score (see Section 11)
  Returns the saved violation object

Step 8 — Frontend navigates to Property Detail
  Shows new violation in table
  Shows updated compliance score
```

---

## 11. Compliance Score Formula

Recalculated after every new violation and after every `resolve`. Runs in the backend violations route — NOT in the database.

```javascript
// backend/src/routes/violations.js — call this after any INSERT or resolve PATCH

async function recalculateScore(propertyId, db) {
  const result = await db.query(
    `SELECT severity FROM violations WHERE property_id = $1 AND status = 'open'`,
    [propertyId]
  );

  const deductions = result.rows.reduce((total, v) => {
    if (v.severity === 'high')   return total + 20;
    if (v.severity === 'medium') return total + 10;
    if (v.severity === 'low')    return total + 5;
    return total;
  }, 0);

  const newScore = Math.max(0, 100 - deductions);

  await db.query(
    `UPDATE properties SET compliance_score = $1 WHERE id = $2`,
    [newScore, propertyId]
  );

  return newScore;
}
```

**Examples:**

| Open Violations | Score |
|---|---|
| None | 100 |
| 1 low | 95 |
| 1 medium | 90 |
| 1 high | 80 |
| 1 high + 1 medium + 1 low | 65 |
| 5 high | 0 (floor) |

---

## 12. Open Questions

One question remaining:

**HOA Rules text** — the `HOA_RULES` constant in `claude.js` is currently placeholder text. The quality of the AI's violation descriptions and rule citations depends entirely on how detailed and accurate this text is. Do you have a real HOA rulebook, or should we write a realistic fictional one for the demo? Either way, this needs to be finalized before the demo so Claude can cite actual rule numbers.

---

*Two tables. One AI call. One email. That's the whole product.*