import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { getProperties, getViolationsTimeline, createProperty, deleteProperty, getFinance, getZones, searchViolations } from '../api';
import PropertyCard       from '../components/PropertyCard';
import ViolationsTimeline from '../components/ViolationsTimeline';
import AvgScoreRing       from '../components/AvgScoreRing';
import FinanceTable       from '../components/FinanceTable';
import MapPanel           from '../components/MapPanel';
import ZoneStatsSidebar   from '../components/ZoneStatsSidebar';

const EMPTY_FORM = {
  address: '', owner_name: '', owner_email: '', owner_phone: '',
  resident_since: '', land_area_sqft: '',
  latitude: null, longitude: null, zone_id: null,
};

// UW Seattle default center [lat, lng] for Leaflet
const DEFAULT_CENTER = [47.655, -122.308];

// Inner component to capture map clicks for pin picker
function PickerClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

// Draggable pin icon for the picker
const pickerIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#2563EB;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function Dashboard() {
  const [activeTab,    setActiveTab]    = useState('properties');
  const [properties,   setProperties]   = useState([]);
  const [zones,        setZones]        = useState([]);
  const [timeline,     setTimeline]     = useState([]);
  const [financeData,  setFinanceData]  = useState(null);
  const [search,       setSearch]       = useState('');
  const [zoneFilter,   setZoneFilter]   = useState('all');
  const [sortBy,       setSortBy]       = useState('score_asc');
  const [showAdd,      setShowAdd]      = useState(false);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [highlightId,  setHighlightId]  = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  // For pin picker in Add modal
  const [pickerPin,    setPickerPin]    = useState(null);
  const [detectedZone, setDetectedZone] = useState(null);
  const [geocoding,    setGeocoding]    = useState(false);

  // Violations search tab
  const [violSearch,   setViolSearch]   = useState('');
  const [violCategory, setViolCategory] = useState('');
  const [violSeverity, setViolSeverity] = useState('');
  const [violStatus,   setViolStatus]   = useState('');
  const [violations,   setViolations]   = useState([]);
  const [violLoading,  setViolLoading]  = useState(false);

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

  useEffect(() => {
    if (activeTab !== 'violations') return;
    setViolLoading(true);
    searchViolations({ search: violSearch, category: violCategory, severity: violSeverity, status: violStatus })
      .then(setViolations)
      .catch(() => {})
      .finally(() => setViolLoading(false));
  }, [activeTab, violSearch, violCategory, violSeverity, violStatus]);

  const handleGeocode = async () => {
    if (!form.address) return;
    setGeocoding(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'HOA-Dashboard/1.0' } }
      );
      const data = await r.json();
      if (data[0]) {
        handlePickerClick({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      } else {
        alert('Address not found on map. Try a more specific address.');
      }
    } catch {
      alert('Geocoding failed.');
    } finally {
      setGeocoding(false);
    }
  };

  function exportCSV(rows, headers, filename) {
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: filename,
    });
    a.click();
  }

  const exportProperties = () => exportCSV(
    filtered.map(p => [
      `"${p.address}"`, `"${p.owner_name}"`, p.owner_email,
      p.combined_score ?? p.compliance_score ?? 100,
      p.open_violations || 0, p.total_owed || 0,
    ]),
    ['Address', 'Owner', 'Email', 'Score', 'Open Violations', 'Total Owed'],
    'properties.csv'
  );

  const exportViolations = () => exportCSV(
    violations.map(v => [
      new Date(v.created_at).toLocaleDateString(),
      `"${v.address}"`, `"${v.owner_name}"`,
      v.category, v.severity, v.status,
      v.fine_amount ?? 0,
    ]),
    ['Date', 'Address', 'Owner', 'Category', 'Severity', 'Status', 'Fine'],
    'violations.csv'
  );

  const filtered = useMemo(() => {
    let list = [...properties];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.address.toLowerCase().includes(q) ||
        p.owner_name.toLowerCase().includes(q)
      );
    }
    if (zoneFilter !== 'all') {
      const zone = zones.find(z => String(z.id) === zoneFilter);
      if (zone?.geojson) {
        list = list.filter(p => {
          if (!p.latitude || !p.longitude) return false;
          try {
            return booleanPointInPolygon(
              { type: 'Feature', geometry: { type: 'Point', coordinates: [parseFloat(p.longitude), parseFloat(p.latitude)] } },
              { type: 'Feature', geometry: zone.geojson }
            );
          } catch { return false; }
        });
      }
    }
    list.sort((a, b) => {
      const sa = a.combined_score ?? a.compliance_score ?? 100;
      const sb = b.combined_score ?? b.compliance_score ?? 100;
      if (sortBy === 'score_asc')  return sa - sb;
      if (sortBy === 'score_desc') return sb - sa;
      if (sortBy === 'violations') return parseInt(b.open_violations || 0) - parseInt(a.open_violations || 0);
      if (sortBy === 'owed')       return parseFloat(b.total_owed || 0) - parseFloat(a.total_owed || 0);
      return 0;
    });
    return list;
  }, [properties, zones, search, zoneFilter, sortBy]);

  const openCount = properties.filter(p => parseInt(p.open_violations) > 0).length;
  const avgScore  = properties.length
    ? Math.round(properties.reduce((s, p) => s + (p.combined_score ?? p.compliance_score ?? 100), 0) / properties.length)
    : 100;

  // Detect zone from coordinates using turf
  const detectZone = (lat, lng) => {
    const point = { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } };
    for (const zone of zones) {
      if (!zone.geojson) continue;
      try {
        if (booleanPointInPolygon(point, { type: 'Feature', geometry: zone.geojson })) return zone;
      } catch {}
    }
    return null;
  };

  const handlePickerClick = ({ lat, lng }) => {
    setPickerPin({ lat, lng });
    const zone = detectZone(lat, lng);
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
        {[['properties', 'Properties'], ['finance', 'Finance'], ['violations', 'Violations']].map(([key, label]) => (
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
            <div className="flex flex-col gap-2" style={{ width: '42%' }}>
              <div className="flex gap-2 flex-shrink-0">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Search by address or owner..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button
                onClick={exportProperties}
                className="px-3 py-2 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition flex-shrink-0"
                title="Export to CSV"
              >
                CSV ↓
              </button>
            </div>
              <div className="flex gap-2 flex-shrink-0">
                <select
                  value={zoneFilter}
                  onChange={e => setZoneFilter(e.target.value)}
                  className="flex-1 border rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  <option value="all">All Zones</option>
                  {zones.map(z => (
                    <option key={z.id} value={String(z.id)}>{z.name}</option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="flex-1 border rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  <option value="score_asc">Score: Low → High</option>
                  <option value="score_desc">Score: High → Low</option>
                  <option value="violations">Most Violations</option>
                  <option value="owed">Most Owed</option>
                </select>
              </div>
              <div className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
                {filtered.map(p => (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHighlightId(p.id)}
                    onMouseLeave={() => setHighlightId(null)}
                  >
                    <PropertyCard property={p} onDelete={handleDelete} isHighlighted={highlightId === p.id} />
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-400 py-12">
                    {search || zoneFilter !== 'all' ? 'No properties match your filters.' : 'No properties yet. Add one above.'}
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
                filterZoneId={zoneFilter !== 'all' ? zoneFilter : null}
                onPropertyClick={p => setHighlightId(p.id)}
                onZoneClick={z => { setSelectedZone(z); setZoneFilter(String(z.id)); }}
              />
              <ZoneStatsSidebar
                zone={selectedZone}
                properties={properties}
                onClose={() => { setSelectedZone(null); setZoneFilter('all'); }}
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

      {activeTab === 'violations' && (
        <div className="space-y-4">
          {/* Filters row */}
          <div className="flex gap-2 flex-wrap">
            <input
              className="flex-1 min-w-[180px] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Search description, address, owner..."
              value={violSearch}
              onChange={e => setViolSearch(e.target.value)}
            />
            <select value={violCategory} onChange={e => setViolCategory(e.target.value)}
              className="border rounded-lg px-2 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">All Categories</option>
              {['landscaping','parking','noise','structural','trash','pets','other'].map(c => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
            <select value={violSeverity} onChange={e => setViolSeverity(e.target.value)}
              className="border rounded-lg px-2 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">All Severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select value={violStatus} onChange={e => setViolStatus(e.target.value)}
              className="border rounded-lg px-2 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="pending_review">Pending Review</option>
              <option value="resolved">Resolved</option>
            </select>
            <button
              onClick={exportViolations}
              disabled={violations.length === 0}
              className="px-3 py-2 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition"
            >
              CSV ↓
            </button>
          </div>

          {/* Results table */}
          {violLoading ? (
            <p className="text-gray-400 text-sm py-8 text-center">Searching...</p>
          ) : violations.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No violations match your filters.</p>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">{violations.length} result{violations.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wide">
                    <tr>
                      <th className="py-2 px-4 text-left font-semibold">Date</th>
                      <th className="py-2 px-4 text-left font-semibold">Property</th>
                      <th className="py-2 px-4 text-left font-semibold">Category</th>
                      <th className="py-2 px-4 text-left font-semibold">Severity</th>
                      <th className="py-2 px-4 text-left font-semibold">Status</th>
                      <th className="py-2 px-4 text-left font-semibold">Fine</th>
                      <th className="py-2 px-4 text-left font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map(v => (
                      <tr key={v.id} className="border-t hover:bg-gray-50 transition">
                        <td className="py-2 px-4 text-gray-500 whitespace-nowrap">
                          {new Date(v.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-4">
                          <a href={`/properties/${v.property_id}`} className="font-medium text-blue-700 hover:underline">
                            {v.address}
                          </a>
                          <p className="text-xs text-gray-400">{v.owner_name}</p>
                        </td>
                        <td className="py-2 px-4 capitalize text-gray-700">{v.category}</td>
                        <td className="py-2 px-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            v.severity === 'high'   ? 'bg-red-100 text-red-700' :
                            v.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                      'bg-green-100 text-green-700'
                          }`}>{v.severity}</span>
                        </td>
                        <td className="py-2 px-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            v.status === 'open'           ? 'bg-orange-100 text-orange-700' :
                            v.status === 'pending_review' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-gray-100 text-gray-600'
                          }`}>{v.status === 'pending_review' ? 'Pending Review' : v.status}</span>
                        </td>
                        <td className="py-2 px-4 text-gray-600">
                          {v.fine_amount != null ? `$${parseFloat(v.fine_amount).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-2 px-4">
                          <a href={`/properties/${v.property_id}/violations/${v.id}/edit`}
                            className="text-xs text-blue-600 hover:underline">Edit</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Property Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1200] p-4">
          <form
            onSubmit={handleAdd}
            className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl overflow-y-auto max-h-[90vh]"
          >
            <h2 className="text-xl font-bold text-blue-900">Add Property</h2>

            {/* Address with geocode button */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={geocoding || !form.address}
                  className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition flex-shrink-0"
                >
                  {geocoding ? '...' : 'Find on map'}
                </button>
              </div>
            </div>

            {[
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
              <div className="rounded-lg overflow-hidden border shadow-sm" style={{ height: 240 }}>
                <MapContainer
                  center={DEFAULT_CENTER}
                  zoom={15}
                  style={{ width: '100%', height: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  />
                  <PickerClickHandler onPick={handlePickerClick} />
                  {zones.filter(z => z.geojson).map(z => (
                    <GeoJSON
                      key={z.id}
                      data={{ type: 'Feature', geometry: z.geojson }}
                      style={{ color: z.color, fillColor: z.color, fillOpacity: 0.12, weight: 1.5 }}
                    />
                  ))}
                  {pickerPin && (
                    <>
                      <Marker
                        position={[pickerPin.lat, pickerPin.lng]}
                        icon={pickerIcon}
                        draggable
                        eventHandlers={{ dragend: (e) => handlePickerClick(e.target.getLatLng()) }}
                      />
                      {form.land_area_sqft > 0 && (
                        <Circle
                          center={[pickerPin.lat, pickerPin.lng]}
                          radius={Math.sqrt((parseFloat(form.land_area_sqft) * 0.0929) / Math.PI)}
                          pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.15, weight: 1.5 }}
                        />
                      )}
                    </>
                  )}
                </MapContainer>
              </div>
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
              <button
                type="submit"
                className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-800"
              >
                Add Property
              </button>
              <button
                type="button"
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
