import { Link } from 'react-router-dom';
import { resolveViolation } from '../api';

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high:   'bg-red-100 text-red-800',
};

export default function ViolationRow({ violation, onResolved }) {
  const handleResolve = async () => {
    if (!window.confirm('Mark this violation as resolved?')) return;
    await resolveViolation(violation.id);
    onResolved(violation.id);
  };

  return (
    <tr className="border-b hover:bg-gray-50 transition">
      <td className="py-3 px-4 text-sm text-gray-500">
        {new Date(violation.created_at).toLocaleDateString()}
      </td>
      <td className="py-3 px-4 capitalize text-sm font-medium text-gray-800">
        {violation.category}
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[violation.severity]}`}>
          {violation.severity}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-600 max-w-xs">
        <p className="truncate">{violation.description}</p>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
          violation.status === 'resolved'
            ? 'bg-gray-100 text-gray-600'
            : 'bg-orange-100 text-orange-700'
        }`}>
          {violation.status}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            to={`/properties/${violation.property_id}/violations/${violation.id}/edit`}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Edit
          </Link>
          {violation.status === 'open' && (
            <button
              onClick={handleResolve}
              className="text-sm text-gray-500 hover:underline"
            >
              Resolve
            </button>
          )}
          {violation.image_url && (
            <a
              href={violation.image_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-gray-400 hover:underline"
            >
              Photo
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
