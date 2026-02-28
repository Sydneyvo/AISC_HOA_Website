const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();  // automatically reads ANTHROPIC_API_KEY from env

// Fallback used only if a property has no PDF uploaded yet
const DEFAULT_HOA_RULES = `
GENERAL HOA RULES (FALLBACK)

Section 3.1 — Lawn & Landscaping
Grass must not exceed 6 inches. Dead plants and weeds must be cleared within 14 days of notice.

Section 4.2 — Refuse & Recycling
Trash containers must be stored out of street view at all times except on collection day.

Section 5.1 — Vehicles & Parking
No RVs, boats, trailers, or commercial vehicles may be parked in driveways for more than 24 hours.

Section 6.3 — Exterior Maintenance
Homes must be kept in good repair: paint, gutters, shutters, fencing, driveways.
Visible damage must be repaired within 30 days of notice.

Section 7.1 — Unapproved Structures
No shed, pergola, fence, or permanent structure may be added without prior HOA board approval.
`;

const VALID_CATEGORIES = ['parking', 'garbage', 'lawn', 'exterior', 'structure', 'other'];

// hoaRulesText comes from the property's rules_text DB column (extracted from their PDF)
async function analyzeViolation(imageBuffer, mimeType = 'image/jpeg', hoaRulesText, hint = '') {
  const base64Image = imageBuffer.toString('base64');
  const rulesContext = hoaRulesText || DEFAULT_HOA_RULES;

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
  "rule_cited": "Section X.X — exact rule text from the rulebook" or null,
  "remediation": "Specific steps the homeowner must take" or null,
  "deadline_days": 7 for minor, 14 for standard, 30 for major — or null
}

Severity guide:
- low: minor, easy to fix, no structural concern (e.g. trash bin out)
- medium: ongoing neglect, visible from street (e.g. overgrown lawn)
- high: structural, safety, or major rule violation (e.g. unapproved structure)

HOA RULEBOOK:
${rulesContext}`,
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

module.exports = { analyzeViolation, DEFAULT_HOA_RULES };
