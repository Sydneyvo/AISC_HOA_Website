import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';

// UW Seattle default center
const DEFAULT_CENTER = [47.655, -122.308];

// Create a colored circular DivIcon for property pins
function makePinIcon(color, isActive) {
  const size = isActive ? 22 : 16;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:50%;
      border:2.5px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3),0 0 0 ${isActive ? '4px' : '0'} ${color}44;
      transition:all 0.15s;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  });
}

function getPinColor(property, mode) {
  if (mode === 'finance') {
    if (parseInt(property.overdue_bills) > 0) return '#EF4444';
    if (parseFloat(property.total_owed) > 0)  return '#F59E0B';
    return '#10B981';
  }
  const score = property.combined_score ?? property.compliance_score ?? 100;
  if (score < 50) return '#EF4444';
  if (score < 80) return '#F59E0B';
  return '#10B981';
}

function pinStat(property, mode) {
  if (mode === 'finance') {
    const owed = parseFloat(property.total_owed || 0);
    return owed > 0 ? `$${owed.toFixed(0)} owed` : 'Paid up';
  }
  return `Score ${property.combined_score ?? property.compliance_score ?? 100}`;
}

// Compute map center from properties or fall back to UW Seattle default
function computeCenter(properties) {
  const withCoords = properties.filter(p => p.latitude && p.longitude);
  if (!withCoords.length) return DEFAULT_CENTER;
  return [
    withCoords.reduce((s, p) => s + parseFloat(p.latitude),  0) / withCoords.length,
    withCoords.reduce((s, p) => s + parseFloat(p.longitude), 0) / withCoords.length,
  ];
}

export default function MapPanel({ properties, zones, mode, highlightedId, onPropertyClick, onZoneClick }) {
  const [hoveredId, setHoveredId] = useState(null);

  const center = useMemo(() => computeCenter(properties), [properties]);

  const zoneStyle = (zone) => () => ({
    color:       zone.color,
    fillColor:   zone.color,
    fillOpacity: 0.15,
    weight:      2,
    dashArray:   '6 3',
  });

  return (
    <div className="h-full rounded-xl overflow-hidden border border-gray-200">
      <MapContainer
        center={center}
        zoom={13.5}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* Zone polygon overlays */}
        {zones.filter(z => z.geojson).map(zone => (
          <GeoJSON
            key={`${zone.id}-${zone.color}`}
            data={{ type: 'Feature', geometry: zone.geojson }}
            style={zoneStyle(zone)}
            eventHandlers={{ click: () => onZoneClick?.(zone) }}
          />
        ))}

        {/* Property pins */}
        {properties.filter(p => p.latitude && p.longitude).map(p => {
          const color    = getPinColor(p, mode);
          const isActive = highlightedId === p.id || hoveredId === p.id;
          return (
            <Marker
              key={p.id}
              position={[parseFloat(p.latitude), parseFloat(p.longitude)]}
              icon={makePinIcon(color, isActive)}
              eventHandlers={{
                click:     () => onPropertyClick?.(p),
                mouseover: () => setHoveredId(p.id),
                mouseout:  () => setHoveredId(null),
              }}
            >
              <Popup>
                <div className="text-xs space-y-1 min-w-[160px]">
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{p.address}</p>
                  <p className="text-gray-500">{p.owner_name}</p>
                  <p className="text-gray-700">{pinStat(p, mode)}</p>
                  {mode !== 'finance' && (
                    <p className="text-gray-500">{p.open_violations} open violation{p.open_violations !== '1' ? 's' : ''}</p>
                  )}
                  <a
                    href={`/properties/${p.id}`}
                    className="block mt-2 text-center px-3 py-1 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 transition"
                  >
                    View Property →
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
