import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { getProperties, getViolationsTimeline, createProperty, deleteProperty, getFinance, getZones } from '../api';
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
  const [showAdd,      setShowAdd]      = useState(false);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [highlightId,  setHighlightId]  = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  // For pin picker in Add modal
  const [pickerPin,    setPickerPin]    = useState(null);
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1200] p-4">
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
