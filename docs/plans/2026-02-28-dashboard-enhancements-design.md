# Dashboard Enhancements Design
**Date:** 2026-02-28 | **Status:** Approved

## Features

### 1. Graph Time Range Toggles
- **File:** `frontend/src/components/ViolationsTimeline.jsx` only
- Add `range` state defaulting to `'6m'`. Buttons: Week | Month | 6 Months | All
- Filter `violations` by `created_at >= cutoff` before mapping to chart data
- No backend changes — all data already loaded

### 2. Avg Score Ring
- **New file:** `frontend/src/components/AvgScoreRing.jsx`
- SVG donut: gray background circle + colored arc via `stroke-dasharray`
- Color thresholds: green ≥80, yellow ≥50, red <50
- Rendered in `Dashboard.jsx` header, replacing inline `avg score {avgScore}` text
- Size: ~96px

### 3. Violations Filter/Sort
- **File:** `frontend/src/pages/PropertyDetail.jsx` only
- Filter bar between header and table
- Controls: Status (All/Open/Resolved pills), Severity (All/Low/Medium/High pills), Category (dropdown), Sort (dropdown)
- `useMemo` derives `filteredViolations` from all four filters
- Show "X violations shown" count

## No backend changes required.
