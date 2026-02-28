# Product Requirements Document
## HOA Compliance Admin Dashboard
**Version:** 1.0 | **Status:** Hackathon MVP | **Date:** February 2026

---

## 1. Product Overview

The HOA Compliance Admin Dashboard is a web application that helps Homeowners Association (HOA) managers track, document, and act on property violations across their community. The core loop is simple: an admin uploads a photo of a violation, the AI identifies the violation type and writes a formal notice referencing the relevant HOA rule, and the admin sends that notice to the homeowner by email — all from one dashboard.

---

## 2. Problem Statement

HOA managers handle compliance manually today. When they spot a violation, they have to:
1. Photograph it
2. Look up which rule was broken
3. Write a citation letter from scratch
4. Track when it was sent and whether it was resolved

This process is slow, inconsistent, and prone to human error. It also creates fairness risks when different rules are applied differently across streets or homeowners. Small HOAs often don't have dedicated staff, so compliance falls behind entirely.

**The core pain:** Writing and sending violation notices takes too long, and tracking compliance across many properties at once is nearly impossible without dedicated software.

---

## 3. Target Users

**Primary User: HOA Admin / Property Manager**
- Manages 20–500 homes in a residential community
- Not necessarily technical; needs a simple, guided interface
- Responsible for enforcement, resident communication, and record-keeping

**Secondary User: Homeowner (Future Scope)**
- Receives violation notices via email
- May want to check their compliance status

---

## 4. Value Proposition

> Upload a photo. Get a ready-to-send violation notice in seconds. Track every property's compliance history in one place.

Specifically:
- **AI reads the HOA rulebook** so the admin doesn't have to search for the right rule every time
- **Auto-generates a formatted notice** with the rule citation, violation description, and remediation steps
- **One-click email delivery** to the homeowner directly from the dashboard
- **Compliance scores and trends** give the admin a community-wide view at a glance

---

## 5. MVP Scope

### What IS in the MVP

| Feature | Description |
|---|---|
| Property List & Dashboard | View all properties with their current compliance score |
| Violation Photo Upload | Admin uploads a photo and selects the property |
| AI Violation Detection | LLM analyzes the photo and identifies the likely violation type |
| AI Notice Auto-Fill | LLM references HOA rules in context and fills a notice form: violation type, rule citation, description, remediation steps, deadline |
| Admin Review & Edit | Admin can review and edit the auto-filled notice before sending |
| Email Notice Delivery | Send the notice to the homeowner's email from the dashboard |
| Violation Log | Per-property history of all violations and notice dates |
| Compliance Score | Simple score per property based on open/resolved violations |

### What is NOT in the MVP

- Homeowner portal or self-upload feature
- Weather-aware grace periods
- Bias/fairness monitoring reports
- Geospatial heatmaps
- Satellite or street-view image integration
- Repeat offender ML detection
- Multi-level notice escalation (soft warning vs. formal)
- Mobile app

These are valid ideas but would take longer to build reliably than a hackathon allows. They are captured in Future Scope (Section 6).

---

## 6. Future Scope

- **Homeowner Portal:** Homeowners log in to see their compliance history and submit pre-check photos ("Will this violate the rules?")
- **Notice Escalation:** Soft warning → formal notice → legal referral workflow with tone controls
- **Bias Monitoring:** Enforcement frequency report broken down by street or neighborhood zone
- **Weather Grace Periods:** Integration with a weather API to auto-pause certain violations (e.g., lawn care) after storms
- **Geospatial View:** Heatmap of violations across the community
- **Automated Photo Inspection:** Pull images from Google Street View or scheduled drone/camera feeds

---

## 7. Functional Requirements

### 7.1 Property Management
- Admin can add properties with: address, homeowner name, homeowner email
- Each property has a compliance score (0–100) and a violation history log
- Dashboard shows all properties, sorted by compliance score

### 7.2 Violation Submission
- Admin selects a property from the dashboard
- Admin uploads one or more photos of the suspected violation
- Admin can optionally type a short description to assist the AI

### 7.3 AI Violation Analysis
- The system sends the uploaded photo + the HOA rulebook (as text context) to the LLM
- The LLM returns:
  - Violation type (e.g., "Overgrown lawn", "Trash bins visible from street")
  - Relevant rule ID and quoted rule text
  - Plain-language description of the violation
  - Suggested remediation steps
  - Suggested resolution deadline (e.g., 14 days from notice date)
- If no violation is detected, the LLM states that and the admin can still file a manual entry

### 7.4 Notice Form
- The AI output pre-fills a notice form with all fields above
- Admin can edit any field before sending
- Admin selects notice tone: Friendly Reminder or Formal Notice (changes the template language, not the AI output)
- Notice includes: property address, homeowner name, date, violation description, rule citation, photo attachment, remediation steps, deadline, HOA contact info

### 7.5 Email Delivery
- Admin clicks "Send Notice"
- The system emails the formatted notice (HTML email with the attached photo) to the homeowner's registered email address
- A copy is saved to the violation log for that property

### 7.6 Violation Log & Compliance Score
- Each property has a log of all violations: date, type, notice sent date, status (Open / Resolved)
- Admin can manually mark a violation as Resolved after follow-up
- Compliance Score = `100 - (open violations × 10)`, minimum 0

### 7.7 Dashboard Summary
- Total properties, number with open violations, community-wide average compliance score
- List of all properties with score, number of open violations, last activity date
- Clicking a property opens its detail page with full violation history

---

## 8. Non-Functional Requirements

- **Usability:** A non-technical admin should be able to complete the full violation-to-notice workflow in under 3 minutes
- **Reliability:** Email delivery should succeed or show a clear error message
- **Privacy:** Homeowner data (names, emails, photos) is not shared with third parties; photos are stored only for the duration of the session or per-violation record
- **Latency:** AI analysis and form auto-fill should return within 15 seconds of photo upload
- **Scale (MVP):** Support up to 200 properties and 1,000 violation records without performance issues

---

## 9. System Architecture (High-Level)

```
┌─────────────────────────────────────────────────────────┐
│                     Admin Browser (Frontend)            │
│   Dashboard → Upload Photo → Review Notice → Send       │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / REST
┌───────────────────────▼─────────────────────────────────┐
│                  Backend API (Node.js / Python)          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Property &   │  │  AI Service  │  │ Email Service │ │
│  │ Violation DB │  │  (LLM Call)  │  │ (SendGrid /   │ │
│  │  (SQLite /   │  │              │  │  Resend API)  │ │
│  │  Postgres)   │  └──────┬───────┘  └───────────────┘ │
│  └──────────────┘         │                             │
└───────────────────────────┼─────────────────────────────┘
                            │ API Call
              ┌─────────────▼──────────────┐
              │   LLM Provider             │
              │   (Claude / GPT-4o)        │
              │                            │
              │  Input:                    │
              │  - Uploaded photo          │
              │  - HOA rulebook (text)     │
              │  - Structured prompt       │
              │                            │
              │  Output:                   │
              │  - Violation type          │
              │  - Rule citation           │
              │  - Description             │
              │  - Remediation steps       │
              └────────────────────────────┘
```

### Components

**Frontend:** React (or plain HTML/JS for simplicity). Three main views: Dashboard, Property Detail, Violation Submission Form.

**Backend API:** A lightweight REST API (Flask or Express) that handles: property CRUD, violation record storage, proxying the LLM call (so the API key is never exposed to the browser), and triggering email sends.

**Database:** Postgres for hackathon simplicity. Two main tables: `properties` and `violations`.

**AI Component:** A single LLM call with vision capability (e.g., Claude claude-sonnet-4-6 or GPT-4o). The HOA rulebook is included as text in the system prompt. The photo is passed as a base64 image. The prompt asks the model to return structured JSON.

**Email:** SendGrid or Resend free tier. The backend renders an HTML email template and sends it using the homeowner's email from the database.

### Data Flow (Violation Submission)

```
1. Admin selects property → uploads photo → clicks "Analyze"
2. Frontend sends photo (base64) + property ID to backend
3. Backend retrieves HOA rules from a static file or DB
4. Backend calls LLM API with: system prompt (HOA rules) + user message (photo + optional description)
5. LLM returns JSON: { violation_type, rule_id, rule_text, description, remediation, deadline_days }
6. Backend saves draft violation record; returns JSON to frontend
7. Frontend populates the notice form with LLM output
8. Admin edits if needed → clicks "Send Notice"
9. Backend renders HTML email, sends via email API, saves violation record with status "Open"
10. Dashboard updates property compliance score
```

---

## 10. User Flows

### Admin: Submit and Send a Violation Notice

```
Login
  └─> Dashboard (all properties + scores)
        └─> Click on a property
              └─> Click "Report Violation"
                    └─> Upload photo
                          └─> (Optional) Type short note
                                └─> Click "Analyze"
                                      └─> AI fills: violation type, rule, description, steps, deadline
                                            └─> Admin reviews and edits
                                                  └─> Select tone: Friendly / Formal
                                                        └─> Click "Send Notice"
                                                              └─> Email sent to homeowner
                                                                    └─> Violation logged, score updated
                                                                          └─> Return to property page
```

### Admin: Mark a Violation Resolved

```
Dashboard
  └─> Click property
        └─> View violation log
              └─> Click "Mark Resolved" on a past violation
                    └─> Status changes to Resolved, compliance score increases
```

---

## 11. Metrics of Success

These are the metrics you would demo or measure at the hackathon:

| Metric | Target |
|---|---|
| Time to send a violation notice | Under 3 minutes end-to-end |
| AI violation detection accuracy (demo set) | Correct violation type identified ≥ 80% of the time |
| AI rule citation accuracy | Relevant rule cited in ≥ 80% of cases |
| Email delivery | Delivered successfully in demo |
| Dashboard load with 10+ properties | Under 2 seconds |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **AI hallucinates a rule** | Admin sends incorrect citation | Admin always reviews before sending; form is fully editable; framed as "AI draft, not final decision" |
| **AI misidentifies the violation** | Wrong violation type logged | Admin can correct the violation type in the form; manual override always available |
| **False positives (no actual violation)** | Admin wastes time or unfairly notices a homeowner | Admin approval gate before any notice is sent; AI output is never sent automatically |
| **Bias in enforcement** | Certain homeowners cited more than others | Out of MVP scope, but violation log provides an audit trail for future analysis |
| **Email goes to spam** | Homeowner doesn't receive notice | Use reputable email API (SendGrid); set up proper SPF/DKIM if time allows; note delivery status |
| **LLM API cost / rate limits** | App breaks under demo load | Use a single, efficient prompt; cache the HOA rules in the system prompt rather than re-fetching; use free tier |
| **HOA rules are ambiguous** | AI can't extract a clear citation | Fall back gracefully: AI states "Rule may apply" and flags the section; admin fills the rest manually |

---

## 13. Constraints

- **Team skill level:** Beginners — avoid microservices, message queues, or complex ML pipelines. One backend service, one database, one LLM call.
- **Time:** Hackathon timeline (~24–48 hours). Scope is intentionally tight.
- **API keys:** Need at minimum one LLM API key (Claude or OpenAI) and one email service API key (SendGrid / Resend free tier).
- **HOA Rules Input:** For the hackathon, the HOA rulebook is a hardcoded text file or a simple text field in the admin settings. No dynamic rule upload interface is needed.
- **Photo Storage:** For the MVP, photos can be stored as base64 in the database or uploaded to a simple object store (e.g., Cloudinary free tier). Persistent file storage is not required for a demo.
- **Authentication:** A single hardcoded admin login (username + password) is sufficient for the hackathon demo. No multi-user role system needed.

---

## 14. Tech Stack Recommendation

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Tailwind CSS | Fast to build, good component ecosystem |
| Backend | Python + FastAPI | Easy to learn, great for API calls |
| Database | Postgres | Zero setup, sufficient for demo scale |
| LLM | Claude claude-sonnet-4-6 (vision) | Strong image understanding, structured JSON output |
| Email | Resend.com | Simple API, generous free tier, easy setup |
| Photo Storage | Base64 in DB or Cloudinary | No extra infrastructure needed |
| Hosting | Vercel (frontend) + Railway / Render (backend) | Free tier, fast deploy |

---

*This document represents the MVP scope for a hackathon. The goal is a working, demonstrable product — not a production-ready platform.*
