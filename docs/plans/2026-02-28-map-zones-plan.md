# Map & Zones Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add a Mapbox split-panel map to the Properties and Finance tabs, admin-drawn zone polygons persisted as GeoJSON, a map-based property pin picker for property creation, and zone-targeted community announcements.

**Architecture:** A reusable `MapPanel` component handles compliance and finance pin modes. Zones are stored as GeoJSON geometries in a `zones` DB table. `@mapbox/mapbox-gl-draw` powers the zone drawing UI at `/settings/zones`. `@turf/boolean-point-in-polygon` runs client-side to auto-detect zone when admin places a property pin.

**Tech Stack:** react-map-gl v7, mapbox-gl v2, @mapbox/mapbox-gl-draw, @turf/boolean-point-in-polygon (frontend + backend), Mapbox public token via `VITE_MAPBOX_TOKEN`

---

### Task 1: DB Migration — zones table + map columns

**Files:**
- Modify: `backend/src/db/migrate.sql` (append at end)

**Step 1: Append to migrate.sql**

Add this block at the very end of `backend/src/db/migrate.sql`:

```sql
-- Migration: Map & Zones
CREATE TABLE IF NOT EXISTS zones (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#3B82F6',
  geojson    JSONB        NOT NULL,
  created_at TIMESTAMP    DEFAULT NOW()
);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS zone_id   INTEGER REFERENCES zones(id) ON DELETE SET NULL;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL;
```

**Step 2: Verify migration runs on startup**

Start the backend:
```bash
cd backend && npm run dev
```
Expected in console: `DB migration applied`

**Step 3: Verify columns exist**

Connect to DB and run:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'properties' AND column_name IN ('latitude','longitude','zone_id');
SELECT column_name FROM information_schema.columns WHERE table_name = 'community_posts' AND column_name = 'zone_id';
SELECT table_name FROM information_schema.tables WHERE table_name = 'zones';
```
Expected: 3 rows for properties, 1 for community_posts, zones table exists.

**Step 4: Commit**
```bash
git add backend/src/db/migrate.sql
git commit -m "feat: add zones table and map columns migration"
```

---

### Task 2: Update Seed Data (UW Seattle)

**Files:**
- Modify: `backend/src/db/schema.sql`

**Step 1: Replace existing seed data entirely**

Replace everything from `-- Seed data for demo` to the end of `schema.sql` with:

```sql
-- Seed data for demo (UW Seattle area)
INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
VALUES
  ('123 NE Campus Pkwy, Seattle, WA',   'John Smith',    'john@example.com',    '555-0101', 2018, 5400, 42,  38,  47.6580, -122.3140),
  ('456 Brooklyn Ave NE, Seattle, WA',  'Maria Garcia',  'maria@example.com',   '555-0102', 2021, 4200, 71,  68,  47.6610, -122.3170),
  ('112 NE Boat St, Seattle, WA',       'Sarah Kim',     'sarah@example.com',   '555-0103', 2020, 3800, 85,  82,  47.6570, -122.3120),
  ('360 NE 45th St, Seattle, WA',       'Tom Nguyen',    'tom@example.com',     '555-0104', 2019, 6200, 92,  89,  47.6630, -122.3110),
  ('789 Montlake Blvd NE, Seattle, WA', 'David Lee',     'david@example.com',   '555-0105', 2015, 6800, 88,  85,  47.6490, -122.3030),
  ('321 E Shelby St, Seattle, WA',      'Priya Patel',   'priya@example.com',   '555-0106', 2022, 3200, 55,  50,  47.6460, -122.2990),
  ('248 Fuhrman Ave E, Seattle, WA',    'Carlos Rivera', 'carlos@example.com',  '555-0107', 2017, 4900, 79,  74,  47.6440, -122.2960),
  ('501 Boyer Ave E, Seattle, WA',      'Amy Chen',      'amy@example.com',     '555-0108', 2016, 5100, 20,  15,  47.6470, -122.3010),
  ('654 17th Ave NE, Seattle, WA',      'Mike Johnson',  'mike@example.com',    '555-0109', 2023, 4400, 30,  25,  47.6520, -122.3090),
  ('987 NE 15th Ave, Seattle, WA',      'Lisa Wang',     'lisa@example.com',    '555-0110', 2020, 5800, 95,  91,  47.6500, -122.3060);

INSERT INTO violations (property_id, category, severity, description, rule_cited, remediation, status, created_at)
VALUES
  (1, 'garbage', 'high',   'Multiple trash bins visible from street since last week.',    'Section 4.2', 'Store all bins behind fence or in garage.',     'open',     NOW() - INTERVAL '5 days'),
  (1, 'lawn',    'medium', 'Grass exceeds 8 inches in front yard.',                        'Section 3.1', 'Mow lawn to under 6 inches immediately.',       'open',     NOW() - INTERVAL '12 days'),
  (2, 'parking', 'medium', 'Boat trailer parked in driveway for 3 days.',                  'Section 5.1', 'Remove trailer or store off-property.',         'open',     NOW() - INTERVAL '3 days'),
  (5, 'lawn',    'low',    'Minor overgrowth along side fence.',                            'Section 3.1', 'Trim to under 6 inches.',                       'resolved', NOW() - INTERVAL '45 days'),
  (6, 'exterior','medium', 'Peeling paint on front exterior visible from street.',          'Section 6.3', 'Repaint within 30 days.',                       'open',     NOW() - INTERVAL '20 days'),
  (8, 'parking', 'high',   'RV parked in driveway for over 2 weeks.',                      'Section 5.1', 'Remove RV or obtain HOA approval.',             'open',     NOW() - INTERVAL '18 days'),
  (8, 'garbage', 'high',   'Trash overflowing bins at curb for multiple days.',             'Section 4.2', 'Schedule additional pickup and store bins.',    'open',     NOW() - INTERVAL '7 days'),
  (9, 'structure','high',  'Unapproved shed erected in backyard.',                          'Section 7.1', 'Remove structure or submit variance request.',  'open',     NOW() - INTERVAL '30 days'),
  (9, 'lawn',    'medium', 'Dead grass across entire front yard.',                          'Section 3.1', 'Reseed or sod within 21 days.',                 'open',     NOW() - INTERVAL '25 days');

UPDATE properties SET compliance_score = 42,  combined_score = 38  WHERE id = 1;
UPDATE properties SET compliance_score = 71,  combined_score = 68  WHERE id = 2;
UPDATE properties SET compliance_score = 85,  combined_score = 82  WHERE id = 3;
UPDATE properties SET compliance_score = 92,  combined_score = 89  WHERE id = 4;
UPDATE properties SET compliance_score = 88,  combined_score = 85  WHERE id = 5;
UPDATE properties SET compliance_score = 55,  combined_score = 50  WHERE id = 6;
UPDATE properties SET compliance_score = 79,  combined_score = 74  WHERE id = 7;
UPDATE properties SET compliance_score = 20,  combined_score = 15  WHERE id = 8;
UPDATE properties SET compliance_score = 30,  combined_score = 25  WHERE id = 9;
UPDATE properties SET compliance_score = 95,  combined_score = 91  WHERE id = 10;
```

**Note:** Zone IDs cannot be seeded in schema.sql because the `zones` table is created in migrate.sql (run after). Zone assignment for seed properties will be done via a seed step in migrate.sql (Task 1 extension) — but since zone polygons are inserted by admins via the UI, leave `zone_id = NULL` in seed data. Admins can draw zones and re-assign after first login.

**Step 2: Verify seed applies on fresh DB**

If testing locally with a fresh DB, run schema.sql then migrate.sql manually. On existing DB, the INSERT rows will conflict on re-run — that is expected (schema.sql is only for fresh installs).

**Step 3: Commit**
```bash
git add backend/src/db/schema.sql
git commit -m "feat: update seed data to UW Seattle area with 10 properties"
```

---

### Task 3: Backend — Zones Route

**Files:**
- Create: `backend/src/routes/zones.js`
- Modify: `backend/src/index.js`

**Step 1: Create `backend/src/routes/zones.js`**

```js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

// GET /api/zones
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM zones ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/zones  { name, color, geojson }
router.post('/', async (req, res) => {
  try {
    const { name, color, geojson } = req.body;
    if (!name || !geojson) return res.status(400).json({ error: 'name and geojson required' });
    const { rows } = await db.query(
      `INSERT INTO zones (name, color, geojson) VALUES ($1, $2, $3) RETURNING *`,
      [name, color || '#3B82F6', JSON.stringify(geojson)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/zones/:id  { name?, color?, geojson? }
router.put('/:id', async (req, res) => {
  try {
    const { name, color, geojson } = req.body;
    const sets   = [];
    const values = [];
    let   idx    = 1;
    if (name   !== undefined) { sets.push(`name   = $${idx++}`); values.push(name); }
    if (color  !== undefined) { sets.push(`color  = $${idx++}`); values.push(color); }
    if (geojson !== undefined){ sets.push(`geojson = $${idx++}`); values.push(JSON.stringify(geojson)); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE zones SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Zone not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/zones/:id
router.delete('/:id', async (req, res) => {
  try {
    // ON DELETE SET NULL handles zone_id FK on properties + community_posts
    await db.query('DELETE FROM zones WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

**Step 2: Register route in `backend/src/index.js`**

After the `/api/community` line, add:
```js
app.use('/api/zones',      requireAuth(), require('./routes/zones'));
```

**Step 3: Manual test**

Start backend, then in another terminal:
```bash
curl -s http://localhost:3001/health   # should return {"ok":true}
```
(Full auth testing happens via the browser UI in later tasks.)

**Step 4: Commit**
```bash
git add backend/src/routes/zones.js backend/src/index.js
git commit -m "feat: add /api/zones CRUD route"
```

---

### Task 4: Update Properties Route — lat/lng/zone_id

**Files:**
- Modify: `backend/src/routes/properties.js`

**Step 1: Update `POST /api/properties` to accept lat/lng/zone_id**

Replace the existing POST handler (lines 61–73) with:

```js
// POST /api/properties
router.post('/', async (req, res) => {
  try {
    const { address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, latitude, longitude, zone_id } = req.body;
    const { rows } = await db.query(
      `INSERT INTO properties
         (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, combined_score, latitude, longitude, zone_id)
       VALUES ($1, $2, $3, $4, $5, $6, 100, $7, $8, $9) RETURNING *`,
      [address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft || null,
       latitude || null, longitude || null, zone_id || null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Update `GET /api/properties` to include zone data**

Replace the SELECT query in the GET / handler with:

```js
const { rows } = await db.query(`
  SELECT p.*,
         z.name  AS zone_name,
         z.color AS zone_color,
         COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations,
         MAX(v.created_at) AS last_activity,
         COALESCE(
           (SELECT SUM(b.total_amount)
            FROM monthly_bills b
            WHERE b.property_id = p.id AND b.status != 'paid'), 0
         ) AS total_owed,
         COALESCE(
           (SELECT COUNT(*) FROM monthly_bills b
            WHERE b.property_id = p.id AND b.status = 'overdue'), 0
         ) AS overdue_bills
  FROM properties p
  LEFT JOIN zones z ON z.id = p.zone_id
  LEFT JOIN violations v ON v.property_id = p.id
  GROUP BY p.id, z.name, z.color
  ORDER BY p.combined_score ASC NULLS LAST
`);
```

**Step 3: Commit**
```bash
git add backend/src/routes/properties.js
git commit -m "feat: add lat/lng/zone_id to properties route"
```

---

### Task 5: Update Community Route — zone_id targeting

**Files:**
- Modify: `backend/src/routes/community.js`

**Step 1: Accept zone_id in POST and filter email recipients**

Replace the `POST /api/community` handler body (lines 69–107) with:

```js
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { email, name } = await getCallerInfo(req);
    const role             = await getRole(email);
    const { title, body, category, zone_id } = req.body;

    if (!title || !body || !category) {
      return res.status(400).json({ error: 'title, body, and category are required' });
    }

    // Only admins can target a specific zone
    const targetZoneId = (role === 'admin' && zone_id) ? parseInt(zone_id, 10) : null;

    let image_url = null;
    if (req.file) {
      image_url = await uploadToBlob(req.file.buffer, req.file.originalname, 'communitycont');
    }

    const { rows } = await db.query(
      `INSERT INTO community_posts (author_email, author_name, author_role, category, title, body, image_url, zone_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [email, name, role, category, title, body, image_url, targetZoneId]
    );
    const post = rows[0];

    if (process.env.ANNOUNCE_EMAIL_NOTIFY === 'true') {
      const recipientQuery = targetZoneId
        ? db.query('SELECT owner_email FROM properties WHERE zone_id = $1', [targetZoneId])
        : db.query('SELECT owner_email FROM properties');

      recipientQuery.then(({ rows: props }) => {
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
```

**Step 2: Update `GET /api/community` to join zone name**

Replace the SELECT query in the GET handler with:

```js
const { rows } = await db.query(
  `SELECT cp.*, z.name AS zone_name, z.color AS zone_color
   FROM community_posts cp
   LEFT JOIN zones z ON z.id = cp.zone_id
   ${where}
   ORDER BY cp.created_at DESC`,
  params
);
```

**Step 3: Commit**
```bash
git add backend/src/routes/community.js
git commit -m "feat: add zone targeting to community posts"
```

---

### Task 6: Frontend — Install Packages + CSS + Vite Config

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Modify: `frontend/vite.config.js`
- Modify: `frontend/src/main.jsx`

**Step 1: Install packages**

```bash
cd frontend && npm install react-map-gl mapbox-gl @mapbox/mapbox-gl-draw @turf/boolean-point-in-polygon
```

Expected: packages added to package.json, no peer dep errors.

**Step 2: Update `frontend/vite.config.js`**

Replace entire file with:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['mapbox-gl'],
  },
});
```

**Step 3: Add CSS imports to `frontend/src/main.jsx`**

Read the current main.jsx. Add these two imports after the existing imports (before the ReactDOM.createRoot call):

```js
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
```

**Step 4: Add Mapbox token to `.env`**

In `frontend/`, open or create `.env` (already exists — add the line):
```
VITE_MAPBOX_TOKEN=pk.eyJ1...your_token_here
```

The user must obtain a free Mapbox public token from https://account.mapbox.com

**Step 5: Verify frontend still starts**
```bash
cd frontend && npm run dev
```
Expected: Vite dev server starts on port 5173 with no errors.

**Step 6: Commit**
```bash
git add frontend/vite.config.js frontend/src/main.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: install react-map-gl, mapbox-gl, draw, turf packages"
```

---

### Task 7: Frontend api.js — Zones CRUD + Update createProperty

**Files:**
- Modify: `frontend/src/api.js`

**Step 1: Add zones API functions**

Append to the end of `frontend/src/api.js`:

```js
// Zones
export const getZones = async () =>
  fetch(`${BASE}/api/zones`, {
    headers: await authHeaders(),
  }).then(json);

export const createZone = async (data) =>
  fetch(`${BASE}/api/zones`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

export const updateZone = async (id, data) =>
  fetch(`${BASE}/api/zones/${id}`, {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

export const deleteZone = async (id) =>
  fetch(`${BASE}/api/zones/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  }).then(json);
```

**Step 2: `createProperty` already passes all body fields via JSON — no change needed.** The new `latitude`, `longitude`, `zone_id` fields added to the form in Task 10 will automatically be included.

**Step 3: Commit**
```bash
git add frontend/src/api.js
git commit -m "feat: add zones API helpers to frontend api.js"
```

---

### Task 8: MapPanel Component

**Files:**
- Create: `frontend/src/components/MapPanel.jsx`

**Step 1: Create the component**

```jsx
import { useState, useCallback, useMemo } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Pin color based on tab mode
function getPinColor(property, mode) {
  if (mode === 'finance') {
    if (parseInt(property.overdue_bills) > 0) return '#EF4444'; // red
    if (parseFloat(property.total_owed) > 0)  return '#F59E0B'; // yellow
    return '#10B981'; // green
  }
  // compliance mode
  const score = property.combined_score ?? property.compliance_score ?? 100;
  if (score < 50) return '#EF4444';
  if (score < 80) return '#F59E0B';
  return '#10B981';
}

function pinStat(property, mode) {
  if (mode === 'finance') {
    const owed = parseFloat(property.total_owed || 0);
    return owed > 0 ? `$${owed.toFixed(0)} owed` : 'Paid';
  }
  return `Score ${property.combined_score ?? property.compliance_score ?? 100}`;
}

export default function MapPanel({ properties, zones, mode, highlightedId, onPropertyClick, onZoneClick }) {
  const [popup,     setPopup]     = useState(null); // property object
  const [hoveredId, setHoveredId] = useState(null);

  // Build a GeoJSON FeatureCollection from zones for the Source layer
  const zonesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: zones
      .filter(z => z.geojson)
      .map(z => ({
        type: 'Feature',
        id: z.id,
        properties: { id: z.id, name: z.name, color: z.color },
        geometry: z.geojson,
      })),
  }), [zones]);

  // Default center: UW Seattle. Falls back to average of properties if any have coords.
  const { centerLng, centerLat } = useMemo(() => {
    const withCoords = properties.filter(p => p.latitude && p.longitude);
    if (!withCoords.length) return { centerLng: -122.308, centerLat: 47.655 };
    return {
      centerLng: withCoords.reduce((s, p) => s + parseFloat(p.longitude), 0) / withCoords.length,
      centerLat: withCoords.reduce((s, p) => s + parseFloat(p.latitude),  0) / withCoords.length,
    };
  }, [properties]);

  const handleMapClick = useCallback((event) => {
    const feature = event.features?.[0];
    if (feature?.layer?.id === 'zone-fill') {
      const zone = zones.find(z => z.id === feature.properties.id);
      if (zone) onZoneClick?.(zone);
      setPopup(null);
    }
  }, [zones, onZoneClick]);

  if (!TOKEN) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-xl text-gray-400 text-sm">
        Set VITE_MAPBOX_TOKEN to enable map
      </div>
    );
  }

  return (
    <div className="relative h-full rounded-xl overflow-hidden border border-gray-200">
      <Map
        mapboxAccessToken={TOKEN}
        initialViewState={{ longitude: centerLng, latitude: centerLat, zoom: 13.5 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        interactiveLayerIds={['zone-fill']}
        onClick={handleMapClick}
      >
        <NavigationControl position="top-right" />

        {/* Zone polygon fills + outlines */}
        {zonesGeoJSON.features.length > 0 && (
          <Source id="zones" type="geojson" data={zonesGeoJSON}>
            <Layer
              id="zone-fill"
              type="fill"
              paint={{
                'fill-color': ['get', 'color'],
                'fill-opacity': 0.15,
              }}
            />
            <Layer
              id="zone-outline"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 2,
                'line-dasharray': [2, 1],
              }}
            />
          </Source>
        )}

        {/* Property pins */}
        {properties.filter(p => p.latitude && p.longitude).map(p => {
          const color     = getPinColor(p, mode);
          const isActive  = highlightedId === p.id || hoveredId === p.id;
          return (
            <Marker
              key={p.id}
              longitude={parseFloat(p.longitude)}
              latitude={parseFloat(p.latitude)}
              anchor="center"
            >
              <div
                title={p.address}
                onClick={() => { setPopup(p); onPropertyClick?.(p); }}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ backgroundColor: color }}
                className={`cursor-pointer rounded-full border-2 border-white shadow-md transition-all ${
                  isActive ? 'w-6 h-6 ring-2 ring-offset-1 ring-blue-400' : 'w-4 h-4'
                }`}
              />
            </Marker>
          );
        })}

        {/* Popup on pin click */}
        {popup && popup.latitude && popup.longitude && (
          <Popup
            longitude={parseFloat(popup.longitude)}
            latitude={parseFloat(popup.latitude)}
            onClose={() => setPopup(null)}
            closeOnClick={false}
            anchor="bottom"
            offset={12}
          >
            <div className="text-xs space-y-1 min-w-[160px]">
              <p className="font-semibold text-gray-900 text-sm leading-tight">{popup.address}</p>
              <p className="text-gray-500">{popup.owner_name}</p>
              <p className="text-gray-700">{pinStat(popup, mode)}</p>
              {mode === 'compliance' && (
                <p className="text-gray-500">{popup.open_violations} open violation{popup.open_violations !== '1' ? 's' : ''}</p>
              )}
              <a
                href={`/properties/${popup.id}`}
                className="block mt-2 text-center px-3 py-1 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 transition"
              >
                View Property →
              </a>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
```

**Step 2: Verify no import errors**

Start frontend dev server — no red console errors from MapPanel import.

**Step 3: Commit**
```bash
git add frontend/src/components/MapPanel.jsx
git commit -m "feat: add MapPanel component with compliance and finance pin modes"
```

---

### Task 9: ZoneStatsSidebar Component

**Files:**
- Create: `frontend/src/components/ZoneStatsSidebar.jsx`

**Step 1: Create the component**

```jsx
export default function ZoneStatsSidebar({ zone, properties, onClose }) {
  if (!zone) return null;

  const zoneProps = properties.filter(p => p.zone_id === zone.id);
  const avgScore  = zoneProps.length
    ? Math.round(zoneProps.reduce((s, p) => s + (p.combined_score ?? p.compliance_score ?? 100), 0) / zoneProps.length)
    : null;
  const totalOwed     = zoneProps.reduce((s, p) => s + parseFloat(p.total_owed || 0), 0);
  const openViolCount = zoneProps.reduce((s, p) => s + parseInt(p.open_violations || 0), 0);

  return (
    <div className="absolute top-2 right-2 w-64 bg-white rounded-xl shadow-xl border z-10 overflow-hidden">
      {/* Header strip with zone color */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: zone.color + '22', borderBottom: `3px solid ${zone.color}` }}>
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Zone</p>
          <h3 className="font-bold text-gray-900">{zone.name}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      {/* Stats */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3 border-b">
        <div>
          <p className="text-xs text-gray-400">Properties</p>
          <p className="text-lg font-bold text-gray-900">{zoneProps.length}</p>
        </div>
        {avgScore !== null && (
          <div>
            <p className="text-xs text-gray-400">Avg Score</p>
            <p className={`text-lg font-bold ${avgScore >= 80 ? 'text-green-600' : avgScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {avgScore}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400">Total Owed</p>
          <p className="text-lg font-bold text-gray-900">${totalOwed.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Open Violations</p>
          <p className={`text-lg font-bold ${openViolCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{openViolCount}</p>
        </div>
      </div>

      {/* Property list */}
      <div className="px-4 py-2 max-h-52 overflow-y-auto">
        {zoneProps.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">No properties in this zone yet.</p>
        ) : (
          <ul className="space-y-1">
            {zoneProps.map(p => (
              <li key={p.id}>
                <a
                  href={`/properties/${p.id}`}
                  className="text-xs text-blue-700 hover:underline block py-0.5 truncate"
                  title={p.address}
                >
                  {p.address}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add frontend/src/components/ZoneStatsSidebar.jsx
git commit -m "feat: add ZoneStatsSidebar component"
```

---

### Task 10: Update Dashboard.jsx — Split Layout + Map Picker

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

**Step 1: Read the current Dashboard.jsx first** (already done in plan prep — see lines 1–184).

**Step 2: Replace the full content of `Dashboard.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { getProperties, getViolationsTimeline, createProperty, deleteProperty, getFinance, getZones } from '../api';
import PropertyCard       from '../components/PropertyCard';
import ViolationsTimeline from '../components/ViolationsTimeline';
import AvgScoreRing       from '../components/AvgScoreRing';
import FinanceTable       from '../components/FinanceTable';
import MapPanel           from '../components/MapPanel';
import ZoneStatsSidebar   from '../components/ZoneStatsSidebar';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const EMPTY_FORM = {
  address: '', owner_name: '', owner_email: '', owner_phone: '',
  resident_since: '', land_area_sqft: '',
  latitude: null, longitude: null, zone_id: null,
};

// UW Seattle default center
const DEFAULT_CENTER = { longitude: -122.308, latitude: 47.655 };

export default function Dashboard() {
  const [activeTab, setActiveTab]     = useState('properties');
  const [properties, setProperties]   = useState([]);
  const [zones,      setZones]        = useState([]);
  const [timeline,   setTimeline]     = useState([]);
  const [financeData,setFinanceData]  = useState(null);
  const [search,     setSearch]       = useState('');
  const [showAdd,    setShowAdd]      = useState(false);
  const [form,       setForm]         = useState(EMPTY_FORM);
  const [loading,    setLoading]      = useState(true);
  const [error,      setError]        = useState(null);
  const [highlightId,setHighlightId] = useState(null);
  const [selectedZone,setSelectedZone]= useState(null);
  // For pin picker in Add modal
  const [pickerPin, setPickerPin]     = useState(null); // { lng, lat }
  const [detectedZone, setDetectedZone] = useState(null);

  useEffect(() => {
    Promise.all([getProperties(), getViolationsTimeline(), getZones()])
      .then(([props, tl, zns]) => {
        setProperties(props);
        setTimeline(tl);
        setZones(zns);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (activeTab === 'finance' && !financeData) {
      getFinance().then(setFinanceData).catch(err => console.error('Finance load error:', err.message));
    }
  }, [activeTab, financeData]);

  const filtered = properties.filter(p =>
    p.address.toLowerCase().includes(search.toLowerCase()) ||
    p.owner_name.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = properties.filter(p => parseInt(p.open_violations) > 0).length;
  const avgScore  = properties.length
    ? Math.round(properties.reduce((s, p) => s + (p.combined_score ?? p.compliance_score), 0) / properties.length)
    : 100;

  // Detect zone from coordinates using turf
  const detectZone = (lng, lat) => {
    const point = { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } };
    for (const zone of zones) {
      if (!zone.geojson) continue;
      try {
        const poly = { type: 'Feature', geometry: zone.geojson };
        if (booleanPointInPolygon(point, poly)) return zone;
      } catch {}
    }
    return null;
  };

  const handlePickerClick = (event) => {
    const { lng, lat } = event.lngLat;
    setPickerPin({ lng, lat });
    const zone = detectZone(lng, lat);
    setDetectedZone(zone);
    setForm(f => ({ ...f, latitude: lat, longitude: lng, zone_id: zone?.id || null }));
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const created = await createProperty(form);
    setProperties(prev => [...prev, { ...created, open_violations: 0 }]);
    setShowAdd(false);
    setForm(EMPTY_FORM);
    setPickerPin(null);
    setDetectedZone(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this property and all its violations?')) return;
    await deleteProperty(id);
    setProperties(prev => prev.filter(p => p.id !== id));
  };

  const handleBillPaid = () => getFinance().then(setFinanceData);

  if (loading) return <div className="p-8 text-gray-400">Loading properties...</div>;
  if (error)   return <div className="p-8 text-red-500">Failed to load: {error}</div>;

  // Finance data enriched with lat/lng from properties list (for map pins)
  const financeProperties = financeData
    ? properties.map(p => ({
        ...p,
        // overdue_bills already in properties response from updated GET query
      }))
    : [];

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-6 flex-1">
          <AvgScoreRing score={avgScore} />
          <div>
            <h1 className="text-3xl font-bold text-blue-900">HOA Compliance Dashboard</h1>
            <p className="text-gray-500 mt-1">
              {properties.length} properties · {openCount} with open violations
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-800 transition flex-shrink-0"
        >
          + Add Property
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[['properties', 'Properties'], ['finance', 'Finance']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-md text-sm font-semibold transition ${
              activeTab === key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'properties' && (
        <>
          {/* Split panel: list left, map right */}
          <div className="flex gap-4" style={{ height: 520 }}>
            {/* Left: list */}
            <div className="flex flex-col gap-3 overflow-y-auto" style={{ width: '42%' }}>
              <input
                className="border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 flex-shrink-0"
                placeholder="Search by address or owner name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                {filtered.map(p => (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHighlightId(p.id)}
                    onMouseLeave={() => setHighlightId(null)}
                    className={`rounded-xl transition ${highlightId === p.id ? 'ring-2 ring-blue-400' : ''}`}
                  >
                    <PropertyCard property={p} onDelete={handleDelete} />
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-400 py-12">
                    {search ? 'No properties match your search.' : 'No properties yet. Add one above.'}
                  </p>
                )}
              </div>
            </div>

            {/* Right: map */}
            <div className="relative flex-1">
              <MapPanel
                properties={properties}
                zones={zones}
                mode="compliance"
                highlightedId={highlightId}
                onPropertyClick={p => setHighlightId(p.id)}
                onZoneClick={z => setSelectedZone(z)}
              />
              <ZoneStatsSidebar
                zone={selectedZone}
                properties={properties}
                onClose={() => setSelectedZone(null)}
              />
            </div>
          </div>

          {/* Violations timeline below */}
          {timeline.length > 0 && <ViolationsTimeline violations={timeline} />}
        </>
      )}

      {activeTab === 'finance' && (
        <div className="flex gap-4" style={{ minHeight: 520 }}>
          {/* Left: finance table */}
          <div style={{ width: '52%' }}>
            <FinanceTable data={financeData} onBillPaid={handleBillPaid} />
          </div>
          {/* Right: map in finance mode */}
          <div className="relative flex-1" style={{ minHeight: 480 }}>
            <MapPanel
              properties={properties}
              zones={zones}
              mode="finance"
              highlightedId={highlightId}
              onPropertyClick={p => setHighlightId(p.id)}
              onZoneClick={z => setSelectedZone(z)}
            />
            <ZoneStatsSidebar
              zone={selectedZone}
              properties={properties}
              onClose={() => setSelectedZone(null)}
            />
          </div>
        </div>
      )}

      {/* Add Property Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleAdd}
            className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl overflow-y-auto max-h-[90vh]"
          >
            <h2 className="text-xl font-bold text-blue-900">Add Property</h2>

            {[
              { name: 'address',        label: 'Address',               required: true },
              { name: 'owner_name',     label: 'Owner Name',            required: true },
              { name: 'owner_email',    label: 'Owner Email',           required: true, type: 'email' },
              { name: 'owner_phone',    label: 'Phone',                 required: false },
              { name: 'resident_since', label: 'Resident Since (year)', required: false, type: 'number' },
              { name: 'land_area_sqft', label: 'Land Area (sq ft)',     required: true,  type: 'number' },
            ].map(({ name, label, required, type = 'text' }) => (
              <div key={name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  required={required}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={form[name]}
                  onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
                />
              </div>
            ))}

            {/* Map pin picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location <span className="text-gray-400 font-normal">(click map to place pin)</span>
              </label>
              {TOKEN ? (
                <div className="rounded-lg overflow-hidden border" style={{ height: 220 }}>
                  <Map
                    mapboxAccessToken={TOKEN}
                    initialViewState={{ longitude: DEFAULT_CENTER.longitude, latitude: DEFAULT_CENTER.latitude, zoom: 13 }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="mapbox://styles/mapbox/streets-v12"
                    cursor="crosshair"
                    onClick={handlePickerClick}
                  >
                    <NavigationControl position="top-right" showCompass={false} />
                    {/* Zone overlays for reference */}
                    {zones.map(z => z.geojson && (
                      <MapPanel.ZoneLayer key={z.id} zone={z} />
                    ))}
                    {pickerPin && (
                      <Marker longitude={pickerPin.lng} latitude={pickerPin.lat} anchor="bottom" draggable
                        onDrag={e => handlePickerClick({ lngLat: e.lngLat })}
                      >
                        <div className="w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
                      </Marker>
                    )}
                  </Map>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Map unavailable — VITE_MAPBOX_TOKEN not set</p>
              )}
              {detectedZone && (
                <p className="mt-1 text-xs text-gray-600">
                  Zone: <span className="font-semibold" style={{ color: detectedZone.color }}>{detectedZone.name}</span>
                </p>
              )}
              {pickerPin && !detectedZone && (
                <p className="mt-1 text-xs text-gray-400">Outside all zones — pin placed with no zone.</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit"
                className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-800"
              >
                Add Property
              </button>
              <button type="button"
                onClick={() => { setShowAdd(false); setPickerPin(null); setDetectedZone(null); setForm(EMPTY_FORM); }}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

**Note:** The `MapPanel.ZoneLayer` reference in the Add modal picker won't work as written — the zone overlays in the picker map need inline Source/Layer. See below for the fix.

**Step 3: Fix the zone layer in the picker map**

The Add modal map picker needs to show zone overlays inline. Replace the zone overlay comment block with:

```jsx
{/* Zone overlays in picker for reference */}
{zones.filter(z => z.geojson).length > 0 && (
  <source
    id="picker-zones"
    type="geojson"
    data={{
      type: 'FeatureCollection',
      features: zones.filter(z => z.geojson).map(z => ({
        type: 'Feature',
        id: z.id,
        properties: { color: z.color },
        geometry: z.geojson,
      })),
    }}
  >
    <Layer id="picker-zone-fill" type="fill" paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 }} />
    <Layer id="picker-zone-line" type="line" paint={{ 'line-color': ['get', 'color'], 'line-width': 1.5 }} />
  </source>
)}
```

Actually, react-map-gl uses `Source` and `Layer` (capitalized JSX components), not lowercase. Use the imports from `react-map-gl`. Remove the broken `MapPanel.ZoneLayer` reference and replace with the inline `Source` + `Layer` pattern shown above (with capital letters).

**Step 4: Verify**

Start frontend. Go to Dashboard:
- Properties tab: list on left, map on right. Property pins appear colored by score.
- Finance tab: finance table on left, map on right. Pins colored by bill status.
- Click a pin → popup with stats and "View Property" link.
- Click a zone (if any drawn) → ZoneStatsSidebar slides in.
- Click "+ Add Property" → modal with embedded map picker.

**Step 5: Commit**
```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: add split-panel map layout to Dashboard Properties and Finance tabs"
```

---

### Task 11: Zone Management Page (`/settings/zones`)

**Files:**
- Create: `frontend/src/pages/ZonesSettings.jsx`

**Step 1: Create the page**

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Source, Layer, NavigationControl, useControl } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { getZones, createZone, updateZone, deleteZone } from '../api';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER = { longitude: -122.308, latitude: 47.655 };

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// react-map-gl v7 control wrapper for MapboxDraw
function DrawControl({ onDrawCreate, onDrawUpdate, onDrawDelete, drawRef }) {
  useControl(
    () => {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
      });
      drawRef.current = draw;
      return draw;
    },
    ({ map }) => {
      map.on('draw.create', onDrawCreate);
      map.on('draw.update', onDrawUpdate);
      map.on('draw.delete', onDrawDelete);
    },
    ({ map }) => {
      map.off('draw.create', onDrawCreate);
      map.off('draw.update', onDrawUpdate);
      map.off('draw.delete', onDrawDelete);
    },
    { position: 'top-left' }
  );
  return null;
}

export default function ZonesSettings() {
  const [zones,          setZones]         = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [drawing,        setDrawing]       = useState(false);  // are we naming a new polygon?
  const [editingZone,    setEditingZone]   = useState(null);   // zone being edited
  const [pendingGeo,     setPendingGeo]    = useState(null);   // geometry from draw tool
  const [nameInput,      setNameInput]     = useState('');
  const [colorInput,     setColorInput]    = useState('#3B82F6');
  const [saving,         setSaving]        = useState(false);
  const drawRef = useRef(null);

  useEffect(() => {
    getZones().then(zns => { setZones(zns); setLoading(false); });
  }, []);

  // Build GeoJSON for display
  const zonesGeoJSON = {
    type: 'FeatureCollection',
    features: zones.filter(z => z.geojson).map(z => ({
      type: 'Feature',
      id: z.id,
      properties: { id: z.id, name: z.name, color: z.color },
      geometry: z.geojson,
    })),
  };

  const onDrawCreate = useCallback((e) => {
    const geometry = e.features[0]?.geometry;
    if (geometry) {
      setPendingGeo(geometry);
      setDrawing(true);
      setNameInput('');
      setColorInput('#3B82F6');
    }
  }, []);

  const onDrawUpdate = useCallback((e) => {
    const geometry = e.features[0]?.geometry;
    if (geometry && editingZone) {
      setPendingGeo(geometry);
    }
  }, [editingZone]);

  const onDrawDelete = useCallback(() => {
    setPendingGeo(null);
    setDrawing(false);
    setEditingZone(null);
  }, []);

  const handleSaveZone = async () => {
    if (!nameInput.trim() || !pendingGeo) return;
    setSaving(true);
    try {
      if (editingZone) {
        const updated = await updateZone(editingZone.id, { name: nameInput, color: colorInput, geojson: pendingGeo });
        setZones(prev => prev.map(z => z.id === updated.id ? updated : z));
      } else {
        const created = await createZone({ name: nameInput, color: colorInput, geojson: pendingGeo });
        setZones(prev => [...prev, created]);
      }
      // Clear draw tool
      drawRef.current?.deleteAll();
      setPendingGeo(null);
      setDrawing(false);
      setEditingZone(null);
    } finally {
      setSaving(false);
    }
  };

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setNameInput(zone.name);
    setColorInput(zone.color);
    setPendingGeo(zone.geojson);
    setDrawing(true);
    // Load existing polygon into draw tool
    if (drawRef.current) {
      drawRef.current.deleteAll();
      drawRef.current.add({
        type: 'Feature',
        geometry: zone.geojson,
        properties: {},
      });
    }
  };

  const handleDeleteZone = async (id) => {
    if (!window.confirm('Delete this zone? Properties in this zone will be unassigned.')) return;
    await deleteZone(id);
    setZones(prev => prev.filter(z => z.id !== id));
  };

  const handleCancel = () => {
    drawRef.current?.deleteAll();
    setPendingGeo(null);
    setDrawing(false);
    setEditingZone(null);
  };

  if (!TOKEN) return (
    <div className="max-w-4xl mx-auto p-8">
      <p className="text-red-500">Set VITE_MAPBOX_TOKEN to use Zone Management.</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-blue-900">Zone Management</h1>
        <p className="text-gray-500 text-sm mt-1">Draw neighborhood zones. Properties and announcements can be assigned to zones.</p>
      </div>

      <div className="flex gap-6" style={{ height: 560 }}>
        {/* Left: zone list */}
        <div className="w-64 flex flex-col gap-3 flex-shrink-0">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Zones ({zones.length})</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : zones.length === 0 ? (
            <p className="text-sm text-gray-400">No zones yet. Use the polygon tool on the map to draw one.</p>
          ) : (
            <ul className="space-y-2 overflow-y-auto flex-1">
              {zones.map(z => (
                <li key={z.id} className="bg-white border rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
                    <span className="text-sm font-medium text-gray-800 truncate">{z.name}</span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => handleEditZone(z)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => handleDeleteZone(z.id)} className="text-xs text-red-500 hover:underline">Del</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Name + color form (appears after drawing) */}
          {drawing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 flex-shrink-0">
              <p className="text-xs font-semibold text-blue-800">{editingZone ? 'Edit Zone' : 'Name New Zone'}</p>
              <input
                type="text"
                placeholder="Zone name (e.g. North Quad)"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex gap-1 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColorInput(c)}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full border-2 ${colorInput === c ? 'border-gray-800' : 'border-transparent'}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveZone}
                  disabled={saving || !nameInput.trim() || !pendingGeo}
                  className="flex-1 text-xs bg-blue-700 text-white rounded py-1.5 font-semibold hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Zone'}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 text-xs bg-gray-100 text-gray-600 rounded py-1.5 hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: map with draw controls */}
        <div className="flex-1 rounded-xl overflow-hidden border">
          <Map
            mapboxAccessToken={TOKEN}
            initialViewState={{ longitude: DEFAULT_CENTER.longitude, latitude: DEFAULT_CENTER.latitude, zoom: 13.5 }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
          >
            <NavigationControl position="top-right" />
            <DrawControl
              onDrawCreate={onDrawCreate}
              onDrawUpdate={onDrawUpdate}
              onDrawDelete={onDrawDelete}
              drawRef={drawRef}
            />

            {/* Existing zones */}
            {zonesGeoJSON.features.length > 0 && (
              <Source id="zones" type="geojson" data={zonesGeoJSON}>
                <Layer
                  id="zone-fill"
                  type="fill"
                  paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }}
                />
                <Layer
                  id="zone-outline"
                  type="line"
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 2 }}
                />
              </Source>
            )}
          </Map>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Tip: Click the polygon icon in the top-left of the map to start drawing. Click vertices to define the zone boundary, then double-click to close the shape.
      </p>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add frontend/src/pages/ZonesSettings.jsx
git commit -m "feat: add ZonesSettings page with mapbox-gl-draw polygon drawing"
```

---

### Task 12: Update App.jsx — Route + Nav Link

**Files:**
- Modify: `frontend/src/App.jsx`

**Step 1: Add import**

After the `CommunityPage` import, add:
```js
import ZonesSettings from './pages/ZonesSettings';
```

**Step 2: Add route**

After the `/community` route, add:
```jsx
<Route path="/settings/zones" element={<ZonesSettings />} />
```

**Step 3: Add nav link**

After the `Community` nav link `<a>` element, add:
```jsx
<a href="/settings/zones" className="text-sm font-medium hover:opacity-80">
  Zones
</a>
```

**Step 4: Verify**

Navigate to `/settings/zones` in the browser — ZonesSettings page renders with map and empty zone list.

**Step 5: Commit**
```bash
git add frontend/src/App.jsx
git commit -m "feat: add /settings/zones route and Zones nav link"
```

---

### Task 13: Update CommunityBoard — Zone Targeting + Zone Badges

**Files:**
- Modify: `frontend/src/components/CommunityBoard.jsx`

**Step 1: Read the current file** (already done — see lines 1–213).

**Step 2: Replace the full file content**

```jsx
import { useState, useEffect } from 'react';
import { getCommunityPosts, createCommunityPost, deleteCommunityPost, getZones } from '../api';

const CATEGORIES = ['all', 'safety', 'lost_pet', 'wildlife', 'infrastructure', 'hoa_notice', 'general'];

const CATEGORY_LABELS = {
  all: 'All', safety: 'Safety', lost_pet: 'Lost Pet', wildlife: 'Wildlife',
  infrastructure: 'Infrastructure', hoa_notice: 'HOA Notice', general: 'General',
};

const CATEGORY_STYLES = {
  safety: 'bg-red-100 text-red-700', lost_pet: 'bg-orange-100 text-orange-700',
  wildlife: 'bg-yellow-100 text-yellow-800', infrastructure: 'bg-purple-100 text-purple-700',
  hoa_notice: 'bg-blue-100 text-blue-700', general: 'bg-gray-100 text-gray-600',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CommunityBoard({ currentUserEmail, isAdmin, onViewed }) {
  const [posts,      setPosts]     = useState([]);
  const [zones,      setZones]     = useState([]);
  const [catFilter,  setCatFilter] = useState('all');
  const [showForm,   setShowForm]  = useState(false);
  const [submitting, setSubmitting]= useState(false);
  const [loading,    setLoading]   = useState(true);

  // Form state
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [category, setCategory] = useState('general');
  const [image,    setImage]    = useState(null);
  const [zoneId,   setZoneId]   = useState('');  // '' = All HOA

  useEffect(() => {
    if (isAdmin) {
      getZones().then(setZones).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    setLoading(true);
    getCommunityPosts(catFilter)
      .then(posts => {
        setPosts(posts);
        localStorage.setItem('community_last_seen', new Date().toISOString());
        onViewed?.();
      })
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
      if (image)  form.append('image',   image);
      if (zoneId) form.append('zone_id', zoneId);

      const post = await createCommunityPost(form);
      setPosts(prev => [post, ...prev]);
      setTitle(''); setBody(''); setCategory('general'); setImage(null); setZoneId('');
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
      {/* Filter pills + New Post button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                catFilter === c ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition flex-shrink-0"
        >
          {showForm ? 'Cancel' : '+ New Post'}
        </button>
      </div>

      {/* Compose form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">New Announcement</h3>
          <input
            type="text" placeholder="Title" value={title}
            onChange={e => setTitle(e.target.value)} maxLength={255} required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={category} onChange={e => setCategory(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {CATEGORIES.filter(c => c !== 'all').map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>

          {/* Zone targeting — admin only */}
          {isAdmin && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Target audience</label>
              <select
                value={zoneId} onChange={e => setZoneId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All HOA</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
          )}

          <textarea
            placeholder="Describe the situation..." value={body}
            onChange={e => setBody(e.target.value)} required rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <div>
            <label className="text-xs text-gray-500 block mb-1">Photo (optional)</label>
            <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0] || null)} className="text-sm text-gray-600" />
          </div>
          <button
            type="submit" disabled={submitting}
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
                  {/* Zone badge */}
                  {post.zone_name && (
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ backgroundColor: (post.zone_color || '#3B82F6') + '22', color: post.zone_color || '#3B82F6' }}
                    >
                      {post.zone_name}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-800">{post.author_name}</span>
                  <span className="text-xs text-gray-400">· {post.author_role === 'admin' ? 'HOA Admin' : 'Resident'}</span>
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
                <img src={post.image_url} alt="Post photo" className="mt-3 rounded-lg border max-h-64 object-cover" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Verify**

Go to `/community` as admin — compose form should show "Target audience" dropdown with "All HOA" + any created zones. Post appears with zone badge if zone selected.

**Step 4: Commit**
```bash
git add frontend/src/components/CommunityBoard.jsx
git commit -m "feat: add zone targeting and zone badges to CommunityBoard"
```

---

## Summary of All Files Changed

| File | Change |
|------|--------|
| `backend/src/db/migrate.sql` | Add zones table, lat/lng/zone_id columns |
| `backend/src/db/schema.sql` | Replace seed with 10 UW Seattle properties |
| `backend/src/routes/zones.js` | New CRUD route |
| `backend/src/index.js` | Register /api/zones route |
| `backend/src/routes/properties.js` | Accept lat/lng/zone_id on create; include zone data in list |
| `backend/src/routes/community.js` | Accept zone_id; filter email by zone; join zone in GET |
| `frontend/package.json` | Add react-map-gl, mapbox-gl, mapbox-gl-draw, turf |
| `frontend/vite.config.js` | Exclude mapbox-gl from optimizeDeps |
| `frontend/src/main.jsx` | Import mapbox-gl + draw CSS |
| `frontend/src/api.js` | Add getZones, createZone, updateZone, deleteZone |
| `frontend/src/components/MapPanel.jsx` | New: map with pins + zone overlays |
| `frontend/src/components/ZoneStatsSidebar.jsx` | New: zone stats sidebar |
| `frontend/src/pages/Dashboard.jsx` | Split-panel layout; map picker in Add modal |
| `frontend/src/pages/ZonesSettings.jsx` | New: zone drawing page |
| `frontend/src/App.jsx` | Add /settings/zones route + Zones nav link |
| `frontend/src/components/CommunityBoard.jsx` | Zone selector + zone badge on posts |
