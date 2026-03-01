# Map & Zones Feature Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Add geographic context to the HOA dashboard: a Mapbox map embedded in both the Properties and Finance tabs showing property pins colored by compliance/financial health, admin-drawn zone polygons for neighborhood segmentation, a click-to-place pin picker for property creation, and zone-targeted community announcements.

---

## Data Model

### New `zones` table
```sql
CREATE TABLE zones (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#3B82F6',  -- hex color for map overlay
  geojson    JSONB        NOT NULL,                     -- Mapbox GeoJSON Feature (Polygon)
  created_at TIMESTAMP    DEFAULT NOW()
);
```

### Modified `properties` table (migration)
```sql
ALTER TABLE properties
  ADD COLUMN latitude  DOUBLE PRECISION,
  ADD COLUMN longitude DOUBLE PRECISION,
  ADD COLUMN zone_id   INTEGER REFERENCES zones(id) ON DELETE SET NULL;
```

### Modified `community_posts` table (migration)
```sql
ALTER TABLE community_posts
  ADD COLUMN zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL;
-- NULL = "All HOA"
```

---

## Backend

### New routes: `/api/zones`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/zones` | Return all zones with geojson |
| POST | `/api/zones` | Create zone `{name, color, geojson}` |
| PUT | `/api/zones/:id` | Update zone name, color, or geojson |
| DELETE | `/api/zones/:id` | Delete zone (zone_id on properties → NULL) |

### Modified routes

**`POST /api/properties`** — accept `latitude`, `longitude`; compute `zone_id` server-side via point-in-polygon against stored zones GeoJSON.

**`POST /api/community`** — accept optional `zone_id`; if set, email only to `owner_email` of properties in that zone; if null, email all owners.

**`GET /api/properties`** — include `latitude`, `longitude`, `zone_id`, `zone_name` in response.

### Point-in-polygon (backend)
Use a ray-casting algorithm or the `@turf/boolean-point-in-polygon` helper from `@turf/turf` to determine which zone (if any) a property falls in on creation/update.

---

## Frontend

### Libraries to add
```
react-map-gl        — React wrapper for Mapbox GL JS
mapbox-gl           — Mapbox GL JS engine
@mapbox/mapbox-gl-draw — Polygon drawing toolbar
@turf/boolean-point-in-polygon — Client-side zone detection
```

### Environment variable
```
VITE_MAPBOX_TOKEN=pk.eyJ1...   — Mapbox public token (safe to expose)
```

---

## UI: Dashboard Map (Properties & Finance tabs)

Both tabs become a **split-panel layout**: property list on the left (~45%), Mapbox map on the right (~55%).

### Properties tab (compliance view)
- Pins colored by `combined_score`:
  - 🔴 Red: score < 50
  - 🟡 Yellow: score 50–79
  - 🟢 Green: score ≥ 80
- Badge on pin: open violation count
- Tooltip on hover: address, score, open violations
- Click pin: popup with address, owner, score, open violations, balance owed → "View Property" button

### Finance tab (financial view)
- Pins colored by current bill status:
  - 🔴 Red: overdue
  - 🟡 Yellow: pending
  - 🟢 Green: paid / no balance
- Badge on pin: amount owed
- Tooltip on hover: address, bill status, amount owed
- Click pin: popup with address, owner, bill total, status → "View Property" button

### Both tabs — shared interactions
- Zone polygons shown as semi-transparent colored overlays (color from `zones.color`)
- Zone label rendered at polygon centroid
- Click zone polygon → **zone stats sidebar** slides in over the right side of the map:
  - Zone name
  - # properties in zone
  - Avg combined score
  - Total owed
  - # open violations
  - List of properties in zone (clickable → navigate to PropertyDetail)
- Clicking a property card on the left list highlights/pulses the corresponding pin on the map
- Clicking a pin highlights the corresponding property card in the left list (scroll into view)

---

## UI: Zone Management (`/settings/zones`)

New admin route. Added to nav bar.

### Layout
**Left panel** — zone list:
- Lists all saved zones with name, color swatch
- Edit button: loads zone's polygon back into drawing mode
- Delete button: confirm dialog, then deletes
- `[+ Draw New Zone]` button: activates drawing mode

**Right panel** — Mapbox map:
- `@mapbox/mapbox-gl-draw` polygon drawing toolbar active when in drawing mode
- Admin clicks vertices, double-clicks to close shape
- On close: "Name this zone" input + color picker appears over the map
- `[Save Zone]` → POST /api/zones
- All existing zones always visible as overlays in view mode
- Properties shown as neutral grey pins for reference

---

## UI: Add Property — Map Pin Picker

The "Add Property" modal embeds a small Mapbox map instead of lat/lng text inputs.

- Map pre-centered on HOA neighborhood (derived from average lat/lng of existing properties, or a config default)
- Admin clicks map → pin drops at that location
- Pin is draggable to fine-tune
- `latitude` / `longitude` fields populated automatically (hidden from user)
- Zone auto-detected client-side via `@turf/boolean-point-in-polygon` against loaded zones — shows "Zone: North Quad" label below map, updates live as pin moves
- If no zones drawn yet: zone label shows "None"
- Server re-validates zone assignment on save

---

## UI: Community Announcements — Zone Targeting

### Create Post form (admin only)
- New "Target" radio group:
  - `◉ All HOA` (default)
  - `○ {zone.name}` for each zone
- Zone options loaded from `GET /api/zones`
- Tenants do not see this selector — their posts always target All HOA

### Community board post card
- Zone badge rendered next to category badge if `zone_id` is set
- Badge color matches `zones.color`
- Example: `[Safety] [North Quad]`

### Email behavior
- `zone_id = null` → email all property `owner_email`s (existing behavior)
- `zone_id = X` → `SELECT owner_email FROM properties WHERE zone_id = X` → send only to those

---

## Seed Data (UW Seattle area)

All seed coordinates clustered near University of Washington, Seattle (center ~47.655, -122.308).

### 3 Zones
| Name | Center approx | Color |
|------|---------------|-------|
| University District | 47.660, -122.315 | #3B82F6 (blue) |
| Montlake | 47.648, -122.300 | #10B981 (green) |
| Greek Row | 47.652, -122.309 | #F59E0B (amber) |

### ~10 Properties (spread across zones, varied scores/statuses)
| Address | Zone | Lat | Lng | Score |
|---------|------|-----|-----|-------|
| 123 NE Campus Pkwy | University District | 47.658 | -122.314 | 42 (red) |
| 456 Brooklyn Ave NE | University District | 47.661 | -122.317 | 71 (yellow) |
| 789 Montlake Blvd NE | Montlake | 47.649 | -122.303 | 88 (green) |
| 321 E Shelby St | Montlake | 47.646 | -122.299 | 55 (yellow) |
| 654 17th Ave NE | Greek Row | 47.652 | -122.309 | 30 (red) |
| 987 NE 15th Ave | Greek Row | 47.650 | -122.306 | 92 (green) |
| 112 NE Boat St | University District | 47.656 | -122.320 | 68 (yellow) |
| 248 Fuhrman Ave E | Montlake | 47.644 | -122.296 | 79 (yellow) |
| 360 NE 45th St | University District | 47.663 | -122.311 | 85 (green) |
| 501 Boyer Ave E | Montlake | 47.647 | -122.301 | 20 (red) |

Mix of scores ensures all three pin colors visible immediately. Mix of bill statuses (overdue, pending, paid) ensures Finance tab map is also interesting.

---

## Navigation changes

- Add `/settings/zones` route to React Router
- Add "Settings" or "Zones" link to admin nav bar (alongside Dashboard, Community)
- `/settings/zones` is admin-only (redirects tenant to TenantDashboard)

---

## Approach Decision

Zone drawing uses **`@mapbox/mapbox-gl-draw`** (Approach A) — the official Mapbox drawing plugin. Zones are drawn once and persisted to DB as GeoJSON. No re-drawing needed day-to-day.
