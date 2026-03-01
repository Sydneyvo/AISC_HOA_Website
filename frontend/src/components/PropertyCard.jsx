import { useNavigate } from 'react-router-dom';
import ComplianceScore from './ComplianceScore';

export default function PropertyCard({ property, onDelete, isHighlighted }) {
  const navigate = useNavigate();

  return (
    <div
      className={`bg-white border rounded-xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition cursor-pointer group ${
        isHighlighted ? 'ring-2 ring-blue-400 ring-inset' : ''
      }`}
      onClick={() => navigate(`/properties/${property.id}`)}
    >
      <ComplianceScore score={property.combined_score ?? property.compliance_score} />

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{property.address}</p>
        <p className="text-sm text-gray-500">{property.owner_name}</p>
        <p className="text-sm text-gray-400 mt-0.5">
          {property.open_violations} open violation{property.open_violations !== '1' ? 's' : ''}
          {property.last_activity && (
            <span> · last {new Date(property.last_activity).toLocaleDateString()}</span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {property.land_area_sqft && (
            <span className="text-xs text-gray-400">{parseFloat(property.land_area_sqft).toLocaleString()} sqft</span>
          )}
          {parseFloat(property.total_owed) > 0 && (
            <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              ${parseFloat(property.total_owed).toFixed(2)} owed
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-blue-600 text-sm font-medium">View →</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(property.id); }}
          className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
