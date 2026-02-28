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

async function analyzeViolation(imageBuffer, mimeType = 'image/jpeg', hoaRulesText, hint = '') {
  const rulesContext = hoaRulesText || DEFAULT_HOA_RULES;
  const base64 = imageBuffer.toString('base64');

  const promptText = `You are an HOA compliance assistant. Analyze this property photo for rule violations based on the rulebook below.

Output ONLY a JSON object — no markdown, no explanation, no code fences.

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

Severity: low=minor fix, medium=ongoing neglect, high=structural/safety.

HOA RULEBOOK:
${rulesContext}

${hint ? `Admin note: "${hint}"` : ''}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemma-3-4b-it:free',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` }
            },
            {
              type: 'text',
              text: promptText
            }
          ]
        }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`Model returned no content. Response: ${JSON.stringify(data).slice(0, 300)}`);

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { analyzeViolation, DEFAULT_HOA_RULES };
