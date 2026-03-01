import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import '@geoman-io/leaflet-geoman-free';
import { getZones, createZone, updateZone, deleteZone } from '../api';

const DEFAULT_CENTER = [47.655, -122.308];
const PRESET_COLORS  = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Inner component that mounts leaflet-geoman controls on the map
function GeomanControl({ onZoneDrawn, onZoneEdited }) {
  const map         = useRef(null);
  const mapInstance = useMap();

  useEffect(() => {
    map.current = mapInstance;
    mapInstance.pm.addControls({
      position:         'topleft',
      drawMarker:       false,
      drawCircleMarker: false,
      drawPolyline:     false,
      drawRectangle:    true,
      drawPolygon:      true,
      drawCircle:       false,
      editMode:         true,
      dragMode:         true,
      cutPolygon:       false,
      removalMode:      true,
    });

    const handleCreate = (e) => {
      const geometry = e.layer.toGeoJSON().geometry;
      onZoneDrawn(geometry, e.layer);
    };
    const handleEdit = (e) => {
      const geometry = e.layer.toGeoJSON().geometry;
      onZoneEdited?.(geometry, e.layer);
    };

    mapInstance.on('pm:create', handleCreate);
    mapInstance.on('pm:edit',   handleEdit);

    return () => {
      mapInstance.pm.removeControls();
      mapInstance.off('pm:create', handleCreate);
      mapInstance.off('pm:edit',   handleEdit);
    };
  }, [mapInstance, onZoneDrawn, onZoneEdited]);

  return null;
}

export default function ZonesSettings() {
  const [zones,        setZones]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [drawing,      setDrawing]      = useState(false);
  const [editingZone,  setEditingZone]  = useState(null);
  const [pendingGeo,   setPendingGeo]   = useState(null);
  const [pendingLayer, setPendingLayer] = useState(null);
  const [nameInput,    setNameInput]    = useState('');
  const [colorInput,   setColorInput]   = useState('#3B82F6');
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    getZones().then(zns => { setZones(zns); setLoading(false); });
  }, []);

  const handleZoneDrawn = (geometry, layer) => {
    setPendingGeo(geometry);
    setPendingLayer(layer);
    setDrawing(true);
    setNameInput('');
    setColorInput('#3B82F6');
  };

  const handleZoneEdited = (geometry) => {
    if (editingZone) setPendingGeo(geometry);
  };

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
      pendingLayer?.remove();
      setPendingGeo(null); setPendingLayer(null);
      setDrawing(false);   setEditingZone(null);
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
  };

  const handleDeleteZone = async (id) => {
    if (!window.confirm('Delete this zone? Properties in this zone will be unassigned.')) return;
    await deleteZone(id);
    setZones(prev => prev.filter(z => z.id !== id));
  };

  const handleCancel = () => {
    pendingLayer?.remove();
    setPendingGeo(null); setPendingLayer(null);
    setDrawing(false);   setEditingZone(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-blue-900">Zone Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Draw neighborhood zones. Properties and announcements can be targeted to zones.
        </p>
      </div>

      <div className="flex gap-6" style={{ height: 560 }}>
        {/* Left: zone list */}
        <div className="w-64 flex flex-col gap-3 flex-shrink-0">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
            Zones ({zones.length})
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : zones.length === 0 ? (
            <p className="text-sm text-gray-400">
              No zones yet. Use the polygon tool on the map to draw one.
            </p>
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

          {/* Name + color form after drawing */}
          {drawing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 flex-shrink-0">
              <p className="text-xs font-semibold text-blue-800">
                {editingZone ? 'Edit Zone' : 'Name New Zone'}
              </p>
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

        {/* Right: map with geoman draw controls */}
        <div className="flex-1 rounded-xl overflow-hidden border">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={13.5}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <GeomanControl onZoneDrawn={handleZoneDrawn} onZoneEdited={handleZoneEdited} />

            {zones.filter(z => z.geojson).map(z => (
              <GeoJSON
                key={`${z.id}-${z.color}`}
                data={{ type: 'Feature', geometry: z.geojson }}
                style={{ color: z.color, fillColor: z.color, fillOpacity: 0.15, weight: 2 }}
              />
            ))}
          </MapContainer>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Tip: Click the polygon icon (▱) in the top-left toolbar to start drawing.
        Click to place vertices, then click the first vertex again to close.
        Double-click a saved zone to edit its shape.
      </p>
    </div>
  );
}
