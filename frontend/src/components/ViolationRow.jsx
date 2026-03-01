import { Link } from 'react-router-dom';
import { resolveViolation } from '../api';

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high:   'bg-red-100 text-red-800',
};

function daysRemaining(createdAt, deadlineDays) {
  const deadline = new Date(createdAt);
  deadline.setDate(deadline.getDate() + deadlineDays);
  const diff = Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function ViolationRow({ violation, onResolved }) {
  const handleResolve = async () => {
    if (!window.confirm('Mark this violation as resolved?')) return;
    await resolveViolation(violation.id);
    onResolved(violation.id);
  };

  const remaining = violation.status === 'open' && violation.deadline_days
    ? daysRemaining(violation.created_at, violation.deadline_days)
    : null;

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
        {violation.status === 'open' && remaining !== null && (
          <p className={`text-xs mt-0.5 font-medium ${remaining <= 3 ? 'text-red-500' : remaining <= 7 ? 'text-orange-500' : 'text-gray-400'}`}>
            {remaining > 0 ? `${remaining}d to resolve` : remaining === 0 ? 'Due today' : `${Math.abs(remaining)}d overdue`}
          </p>
        )}
        {violation.status === 'resolved' && violation.resolved_at && (
          <p className="text-xs mt-0.5 text-green-600">
            Resolved {new Date(violation.resolved_at).toLocaleDateString()}
          </p>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-600">
        {violation.fine_amount != null ? `$${parseFloat(violation.fine_amount).toFixed(2)}` : '—'}
      </td>
      <td className="py-3 px-4">
        <div className="flex flex-col gap-1">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full w-fit ${
            violation.status === 'resolved' ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-700'
          }`}>
            {violation.status}
          </span>
          {violation.notice_sent_at && (
            <span className="text-xs text-blue-500">
              Notice sent {new Date(violation.notice_sent_at).toLocaleDateString()}
            </span>
          )}
        </div>
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
            <button onClick={handleResolve} className="text-sm text-gray-500 hover:underline">
              Resolve
            </button>
          )}
          {violation.image_url && (
            <a href={violation.image_url} target="_blank" rel="noreferrer"
              className="text-xs text-gray-400 hover:underline">
              Photo
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
