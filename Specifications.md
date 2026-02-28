# HOA Admin Dashboard — Technical Specification
**Version:** 1.0 | **Stack:** React + Express.js + PostgreSQL + Claude API + Resend

---

## Table of Contents
1. [What We're Building](#1-what-were-building)
2. [Database Schema](#2-database-schema-postgresql)
3. [API Routes](#3-api-routes)
4. [Folder & File Structure](#4-folder--file-structure)
5. [Environment Variables](#5-environment-variables)
6. [The Claude AI Prompt](#6-the-claude-ai-prompt)
7. [The Email Template](#7-the-email-template)
8. [Screen-by-Screen Breakdown](#8-screen-by-screen-breakdown)
9. [Data Flow: Full Violation Walkthrough](#9-data-flow-full-violation-walkthrough)
10. [Compliance Score Formula](#10-compliance-score-formula)
11. [Assumptions & Open Questions](#11-assumptions--open-questions)

---

## 1. What We're Building

Three screens, one core loop:

```
[Screen 1: Properties List]
  → Click a property →
[Screen 2: Property Detail]
  → Click "Report Violation" →
[Screen 3: Violation Form]
  → Upload photo → AI fills form → Admin reviews → Submit → Email sent
```

That's it. Everything else (the score, the history, the graph) lives on Screen 2 and updates automatically as violations are logged.

---

## 2. Database Schema (PostgreSQL)

Two tables. That's all you need.

### Table 1: `properties`

This maps to your "Property" schema from the sketch.

```sql
CREATE TABLE properties (
  id                SERIAL PRIMARY KEY,
  address           VARCHAR(255) NOT NULL,
  owner_name        VARCHAR(255) NOT NULL,      -- "tenant names" on sketch — see note below
  owner_email       VARCHAR(255) NOT NULL,
  owner_phone       VARCHAR(50),
  resident_since    INTEGER,                    -- year they moved in, e.g. 2019
  compliance_score  INTEGER DEFAULT 100,        -- 0–100, recalculated on each new/resolved violation
  created_at        TIMESTAMP DEFAULT NOW()
);
```

> **Note on "tenant names":** In HOA context, the person receiving violations is typically the **property owner**, even if they rent it out. We're calling this `owner_name`. If you want to store a separate renter contact, that can be added later. For the MVP, one contact per property is enough.

### Table 2: `violations`

This maps to your "Compliance Tracker" schema from the sketch.

```sql
CREATE TABLE violations (
  id              SERIAL PRIMARY KEY,
  property_id     INTEGER REFERENCES properties(id) ON DELETE CASCADE,

  -- Core violation info (filled by Claude, editable by admin)
  category        VARCHAR(100) NOT NULL,        -- see category list below
  severity        VARCHAR(10) NOT NULL          -- 'low', 'medium', 'high'
                  CHECK (severity IN ('low', 'medium', 'high')),
  description     TEXT NOT NULL,               -- Claude writes this, admin can edit
  rule_cited      TEXT,                         -- which HOA rule was broken
  remediation     TEXT,                         -- what the homeowner needs to do
  deadline_days   INTEGER DEFAULT 14,          -- days to fix it

  -- Status tracking
  status          VARCHAR(20) DEFAULT 'open'
                  CHECK (status IN ('open', 'resolved')),

  -- Metadata
  image_url       TEXT,                         -- URL to stored image (Cloudinary or Azure Blob)
  notice_sent_at  TIMESTAMP,                    -- when email was actually sent
  resolved_at     TIMESTAMP,                    -- when admin marked it resolved
  created_at      TIMESTAMP DEFAULT NOW()
);
```

### Violation Categories (the "Constant List" from your sketch)

These are the fixed categories the admin picks from (and Claude will also return one of these):

```
parking         → Unauthorized vehicle, RV, boat in driveway
garbage         → Trash bins visible from street, improper disposal
lawn            → Overgrown grass, dead landscaping, weeds
exterior        → Peeling paint, broken shutters, damaged fence
structure       → Unapproved shed, pergola, or modification
noise           → (future use)
other           → Catch-all for anything not listed
```

### The Relationship

```
properties (1) ──────< violations (many)
     id                   property_id (foreign key)
```

One property can have many violations over time. Each violation knows which property it belongs to via `property_id`.

### Seed Data (for development/demo)

```sql
-- Insert a few test properties so the dashboard isn't empty
INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since)
VALUES
  ('123 Maple Street', 'John Smith', 'john@example.com', '555-0101', 2018),
  ('456 Oak Avenue', 'Maria Garcia', 'maria@example.com', '555-0102', 2021),
  ('789 Pine Road', 'David Lee', 'david@example.com', '555-0103', 2015);
```

---

## 3. API Routes

All routes are prefixed with `/api`. The frontend calls these.

### Properties

| Method | Route | What it does | Request Body | Response |
|---|---|---|---|---|
| GET | `/api/properties` | Get all properties, sorted by compliance score | — | Array of property objects |
| GET | `/api/properties/:id` | Get one property + all its violations | — | Property + violations array |
| POST | `/api/properties` | Add a new property | `{ address, owner_name, owner_email, owner_phone, resident_since }` | New property object |

### Violations

| Method | Route | What it does | Request Body | Response |
|---|---|---|---|---|
| POST | `/api/violations/analyze` | Send photo to Claude, get back filled form data | `{ property_id, image_base64, hint? }` | `{ category, severity, description, rule_cited, remediation, deadline_days }` |
| POST | `/api/violations` | Save the violation + send email notice | `{ property_id, category, severity, description, rule_cited, remediation, deadline_days, image_url, send_email }` | New violation object |
| PATCH | `/api/violations/:id/resolve` | Mark a violation as resolved | — | Updated violation object |

### Route Details

#### `POST /api/violations/analyze`
This is the AI step. It does NOT save anything to the database — it just returns the Claude analysis so the admin can review it first.

```javascript
// Request
{
  "property_id": 1,
  "image_base64": "data:image/jpeg;base64,/9j/4AAQ...",
  "hint": "trash bins out front"   // optional, admin can type a note
}

// Response
{
  "category": "garbage",
  "severity": "low",
  "description": "Trash bins are visible from the street on a non-collection day.",
  "rule_cited": "Section 4.2 — Refuse containers must be stored out of street view except on collection days.",
  "remediation": "Move trash bins to the side yard or garage before end of day.",
  "deadline_days": 7
}
```

#### `POST /api/violations`
This saves the (admin-reviewed) violation and fires the email.

```javascript
// Request
{
  "property_id": 1,
  "category": "garbage",
  "severity": "low",
  "description": "Trash bins are visible from the street on a non-collection day.",
  "rule_cited": "Section 4.2 — Refuse containers must be stored out of street view.",
  "remediation": "Move trash bins to the side yard or garage before end of day.",
  "deadline_days": 7,
  "image_url": "https://res.cloudinary.com/your-account/image/upload/v123/violations/abc.jpg",
  "send_email": true   // false = save as draft without sending
}

// Response
{
  "id": 42,
  "property_id": 1,
  "status": "open",
  "notice_sent_at": "2026-02-28T14:32:00Z",
  ...
}
```

---

## 4. Folder & File Structure

```
hoa-dashboard/
│
├── frontend/                        ← Lovable-generated React app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        ← Screen 1: All properties list
│   │   │   ├── PropertyDetail.jsx   ← Screen 2: One property + violations
│   │   │   └── ViolationForm.jsx    ← Screen 3: Upload photo + review form
│   │   ├── components/
│   │   │   ├── PropertyCard.jsx     ← Card shown in the list
│   │   │   ├── ViolationRow.jsx     ← Row in the violation history table
│   │   │   ├── ComplianceScore.jsx  ← The score circle/badge
│   │   │   └── ComplianceGraph.jsx  ← The trend graph (violations/year)
│   │   ├── api.js                   ← All fetch() calls to the backend live here
│   │   └── App.jsx
│   ├── .env                         ← VITE_API_URL=http://localhost:3001
│   └── package.json
│
├── backend/                         ← Express.js app
│   ├── src/
│   │   ├── routes/
│   │   │   ├── properties.js        ← GET/POST /api/properties
│   │   │   └── violations.js        ← POST /api/violations/analyze, POST /api/violations
│   │   ├── services/
│   │   │   ├── claude.js            ← Claude API call logic lives here
│   │   │   └── email.js             ← Resend email logic lives here
│   │   ├── db/
│   │   │   ├── index.js             ← PostgreSQL connection (pg pool)
│   │   │   └── schema.sql           ← The SQL from Section 2 above
│   │   └── index.js                 ← Express app entry point
│   ├── .env                         ← All secrets (never commit this)
│   └── package.json
│
├── .gitignore                       ← Must include: node_modules, .env, *.env
└── README.md
```

### The `api.js` file (frontend)

All backend calls go through one file so the URL is never hardcoded in 10 places:

```javascript
// frontend/src/api.js
const BASE = import.meta.env.VITE_API_URL;   // reads from .env

export const getProperties = () =>
  fetch(`${BASE}/api/properties`).then(r => r.json());

export const getProperty = (id) =>
  fetch(`${BASE}/api/properties/${id}`).then(r => r.json());

export const analyzeViolation = (data) =>
  fetch(`${BASE}/api/violations/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json());

export const submitViolation = (data) =>
  fetch(`${BASE}/api/violations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json());

export const resolveViolation = (id) =>
  fetch(`${BASE}/api/violations/${id}/resolve`, { method: 'PATCH' }).then(r => r.json());
```

---

## 5. Environment Variables

### Backend `.env`
```
# Database
DATABASE_URL=postgresql://username:password@your-azure-host:5432/hoadb

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Resend Email
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourhoa.com

# Server
PORT=3001
```

### Frontend `.env`
```
# Points to your backend (change to Azure URL after deploy)
VITE_API_URL=http://localhost:3001
```

### `.gitignore` (critical — add this before first commit)
```
node_modules/
.env
*.env
.env.local
dist/
```

Share the actual secret values in your private group chat, never in GitHub.

---

## 6. The Claude AI Prompt

This is the most important piece of code in the whole app. It lives in `backend/src/services/claude.js`.

### How it works

You send Claude:
1. A **system prompt** that contains the HOA rulebook and instructions on how to respond
2. A **user message** that contains the photo (as base64) and optionally a hint from the admin

Claude returns a **JSON object** with the filled form fields.

### The code

```javascript
// backend/src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();

const HOA_RULES = `
MAPLE GROVE HOA — COMMUNITY RULES SUMMARY

Section 3.1 — Lawn & Landscaping
Grass must not exceed 6 inches in height. Dead plants, weeds, and overgrown 
hedges must be addressed within 14 days of notice.

Section 4.2 — Refuse & Recycling
Trash and recycling containers must be stored out of street view at all times 
except on the designated collection day. Bins must be returned by 8pm on 
collection day.

Section 5.1 — Vehicles & Parking
No recreational vehicles, boats, trailers, or commercial vehicles may be 
parked in driveways or on streets for more than 24 hours. All vehicles must 
be registered and operable.

Section 6.3 — Exterior Maintenance
Homes must be kept in good repair. This includes: paint (no peeling or 
fading), gutters, shutters, fencing, and driveways. Visible damage must be 
repaired within 30 days of notice.

Section 7.1 — Unapproved Structures
No shed, pergola, fence, satellite dish, or permanent structure may be added 
without prior written approval from the HOA board.
`;
// ^ Replace this with your actual HOA rules

const VALID_CATEGORIES = ['parking', 'garbage', 'lawn', 'exterior', 'structure', 'other'];
const VALID_SEVERITIES = ['low', 'medium', 'high'];

async function analyzeViolation(imageBase64, hint = '') {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an HOA compliance assistant. You analyze photos of properties 
and identify potential rule violations based on the HOA rulebook provided below.

When given a photo, you must respond with ONLY a valid JSON object — no explanation, 
no markdown, no extra text. Just the raw JSON.

The JSON must have exactly these fields:
{
  "category": one of [${VALID_CATEGORIES.join(', ')}],
  "severity": one of [${VALID_SEVERITIES.join(', ')}],
  "description": "2-3 sentence plain English description of what you see in the photo",
  "rule_cited": "The relevant rule section and text from the HOA rules, or null if none applies",
  "remediation": "What the homeowner needs to do to fix this",
  "deadline_days": a number (7 for minor, 14 for standard, 30 for major repairs),
  "violation_detected": true or false
}

If no violation is detected, set violation_detected to false and fill other fields with null.

HOA RULEBOOK:
${HOA_RULES}`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
            }
          },
          {
            type: 'text',
            text: hint
              ? `Analyze this property photo for HOA violations. Admin note: "${hint}"`
              : 'Analyze this property photo for HOA violations.'
          }
        ]
      }
    ]
  });

  const text = response.content[0].text.trim();
  return JSON.parse(text);  // Claude returns raw JSON per our instructions
}

module.exports = { analyzeViolation };
```

---

## 7. The Email Template

Lives in `backend/src/services/email.js`. Uses Resend to send a formatted HTML email to the homeowner.

```javascript
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendViolationNotice({ property, violation }) {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + violation.deadline_days);
  const deadlineStr = deadline.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const severityColor = {
    low: '#f59e0b',
    medium: '#f97316',
    high: '#ef4444'
  }[violation.severity];

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e3a5f; padding: 24px; color: white;">
        <h1 style="margin: 0; font-size: 20px;">HOA Compliance Notice</h1>
        <p style="margin: 4px 0 0; opacity: 0.8;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div style="padding: 24px; background: #f9fafb;">
        <p>Dear ${property.owner_name},</p>
        <p>This notice is to inform you of a compliance issue identified at your property:</p>
        <p style="font-weight: bold;">${property.address}</p>

        <div style="background: white; border-left: 4px solid ${severityColor}; padding: 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Violation Type</p>
          <p style="margin: 0; font-size: 18px; font-weight: bold;">${violation.category.charAt(0).toUpperCase() + violation.category.slice(1)}</p>
          <span style="background: ${severityColor}; color: white; font-size: 11px; padding: 2px 8px; border-radius: 999px; display: inline-block; margin-top: 4px;">
            ${violation.severity.toUpperCase()} SEVERITY
          </span>
        </div>

        <h3>What Was Observed</h3>
        <p>${violation.description}</p>

        ${violation.rule_cited ? `
        <h3>Applicable Rule</h3>
        <p style="background: #f3f4f6; padding: 12px; border-radius: 4px; font-style: italic;">${violation.rule_cited}</p>
        ` : ''}

        <h3>Required Action</h3>
        <p>${violation.remediation}</p>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <strong>Resolution Deadline: ${deadlineStr}</strong><br>
          Please resolve this violation within ${violation.deadline_days} days of this notice.
        </div>

        ${violation.image_url ? `
        <h3>Photo on File</h3>
        <img src="${violation.image_url}" alt="Violation photo" style="max-width: 100%; border-radius: 4px;" />
        ` : ''}

        <p style="margin-top: 24px;">If you have questions or believe this notice was issued in error, please contact the HOA office.</p>
        <p>Thank you for your cooperation.</p>
        <p><strong>HOA Management</strong></p>
      </div>

      <div style="padding: 16px; background: #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
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

## 8. Screen-by-Screen Breakdown

Based on your wireframe sketch, here is exactly what each screen should show and do.

### Screen 1: Properties Dashboard (`/`)

**What the admin sees:**
- Page header: "Your Properties" + an "Add Property" button
- Sort/filter controls: by compliance score (high → low), by number of open violations
- A list of property cards. Each card shows:
  - Address
  - Owner name
  - Compliance score (color-coded: green ≥80, yellow 50–79, red <50)
  - Number of open violations
  - Last activity date

**What it loads from the API:**
```
GET /api/properties
```

---

### Screen 2: Property Detail (`/properties/:id`)

**What the admin sees:**
- Property header: address, owner name, email, phone, resident since year
- Large compliance score display
- A line graph showing **# violations per year** (x-axis: year, y-axis: count) — this is the "track how HOA is doing for all properties" graph from your sketch, but scoped per property at the MVP level
- Two tabs: **Details** | **Records** (matches your sketch's "Details / Some" tabs)
  - Details tab: property info, option to edit
  - Records tab: table of all past violations (date, category, severity, status, action)
- A prominent **"Report Violation"** button that navigates to Screen 3

**What it loads from the API:**
```
GET /api/properties/:id   → returns property + violations array
```

---

### Screen 3: Violation Form (`/properties/:id/violations/new`)

This is the most complex screen. It has two states:

**State A — Upload (before AI analysis):**
- Photo upload box (drag & drop or click to select)
- Optional text field: "Describe what you see (optional — helps the AI)"
- Category dropdown — pre-select or let AI decide
- "Analyze Photo" button

**State B — Review (after AI analysis):**
- The photo is shown on the left (or top on mobile)
- On the right, a form pre-filled by Claude with all fields editable:
  - Category (dropdown, pre-selected)
  - Severity (Low / Medium / High toggle)
  - Description (text area)
  - Rule Cited (text area)
  - Remediation Steps (text area)
  - Deadline (number input, default from AI)
- "Send Notice" button → saves violation + sends email
- "Save Without Sending" button → saves as draft, no email

**Loading state between A and B:**
Show a spinner with text "Analyzing photo..." — Claude takes 3–8 seconds.

---

## 9. Data Flow: Full Violation Walkthrough

```
Step 1 — Admin opens Screen 3 (Violation Form)
  Frontend navigates to /properties/1/violations/new

Step 2 — Admin uploads a photo
  Browser converts the image to base64 (using FileReader API)
  Admin optionally types a note: "trash bins visible from driveway"

Step 3 — Admin clicks "Analyze Photo"
  Frontend calls: POST /api/violations/analyze
  Body: { property_id: 1, image_base64: "data:image/jpeg;base64,...", hint: "trash bins..." }

Step 4 — Backend receives request
  Extracts image and hint
  Loads HOA_RULES from the string constant in claude.js
  Calls Claude API with system prompt (rules) + user message (photo + hint)
  Claude returns JSON: { category, severity, description, rule_cited, remediation, deadline_days }
  Backend returns this JSON to the frontend

Step 5 — Frontend populates the form
  All fields fill automatically from the Claude JSON
  Admin reads it over, edits if needed
  Admin selects tone (friendly/formal — just changes the email greeting style)

Step 6 — Admin clicks "Send Notice"
  Frontend calls: POST /api/violations
  Body: { property_id: 1, category, severity, description, ..., send_email: true }

Step 7 — Backend saves violation + sends email
  INSERT INTO violations (...) VALUES (...)
  Fetches property from DB to get owner_name, owner_email
  Calls sendViolationNotice({ property, violation }) via Resend API
  Updates notice_sent_at timestamp on the violation record
  Recalculates and updates compliance_score on the property record
  Returns the saved violation object

Step 8 — Frontend updates UI
  Navigates back to Property Detail screen
  Shows the new violation in the records table
  Shows updated compliance score
```

---

## 10. Compliance Score Formula

You had: *# violations/year & level → Compliance Score*. Here's a concrete formula:

```javascript
// Called after every violation INSERT or resolve PATCH

function calculateComplianceScore(openViolations) {
  // Each open violation reduces the score based on severity
  const deductions = openViolations.reduce((total, v) => {
    if (v.severity === 'high')   return total + 20;
    if (v.severity === 'medium') return total + 10;
    if (v.severity === 'low')    return total + 5;
    return total;
  }, 0);

  return Math.max(0, 100 - deductions);
}

// Run this query, then call the function above:
// SELECT * FROM violations WHERE property_id = $1 AND status = 'open'
```

So a property with:
- 1 high severity open violation → score = 80
- 2 medium open violations → score = 80
- 1 high + 1 medium + 1 low → score = 65
- All violations resolved → score = 100

---

## 11. Assumptions & Open Questions

### Assumptions I Made (confirm or correct these)

| Assumption | What I did | Want to change? |
|---|---|---|
| "Tenant names" = the property owner | Used `owner_name` — one contact per property | Tell me if you need a separate renter field |
| Violation status is just "open" or "resolved" | Removed the crossed-out "closed" from your sketch — open/resolved covers it | Fine to add "pending_appeal" later |
| The trend graph is per-property | Shows violations over time for one property | Could also do community-wide on the main dashboard |
| HOA rules are a hardcoded text string in the backend | Simplest approach for a hackathon | Could be a DB table or uploaded PDF in a future version |
| Image storage via URL | Store image externally (Cloudinary free tier) and save the URL | Let me know if you want a different approach |

### Questions I Have for You

1. **Categories** — I expanded "Parking, Garbage" to 7 categories based on the PRD. Are you okay with this list, or do you want to change/simplify it?

2. **The community-wide graph** — on your sketch you wrote "track how HOA is doing for all properties." Should the main dashboard (Screen 1) also show a graph of total violations across the whole community over time? Easy to add.

3. **Image storage** — do you have a Cloudinary account, or would you rather use Azure Blob Storage (since you have Azure credits)? Both work fine; just need to pick one so Person 4 can set it up.

4. **HOA Rules** — do you have an actual HOA rulebook you want to use, or should we use fictional placeholder rules for the demo? The quality of the AI output depends entirely on how good the rules text is.

---

*Built for hackathon. Two tables, one AI call, one email. Keep it simple.*