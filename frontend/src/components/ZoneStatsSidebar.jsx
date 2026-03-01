export default function ZoneStatsSidebar({ zone, properties, onClose }) {
  if (!zone) return null;

  const zoneProps    = properties.filter(p => p.zone_id === zone.id);
  const avgScore     = zoneProps.length
    ? Math.round(zoneProps.reduce((s, p) => s + (p.combined_score ?? p.compliance_score ?? 100), 0) / zoneProps.length)
    : null;
  const totalOwed    = zoneProps.reduce((s, p) => s + parseFloat(p.total_owed || 0), 0);
  const openViolCount = zoneProps.reduce((s, p) => s + parseInt(p.open_violations || 0), 0);

  return (
    <div className="absolute top-2 right-2 w-64 bg-white rounded-xl shadow-xl border z-10 overflow-hidden">
      {/* Header strip with zone color */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: zone.color + '22', borderBottom: `3px solid ${zone.color}` }}
      >
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
