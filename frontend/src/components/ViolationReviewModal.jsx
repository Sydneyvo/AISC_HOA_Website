import { useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveViolation, reopenViolation } from '../api';

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high:   'bg-red-100 text-red-800',
};

function ViolationReviewModal({ violation, onClose, onConfirmed, onRejected }) {
  const [loading, setLoading] = useState(null); // 'confirm' | 'reject'

  const handleConfirm = async () => {
    setLoading('confirm');
    try {
      await resolveViolation(violation.id);
      onConfirmed(violation.id);
      onClose();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading('reject');
    try {
      await reopenViolation(violation.id);
      onRejected(violation.id);
      onClose();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setLoading(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Review Tenant Fix</h2>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">{violation.category} · {violation.address || ''}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Violation info */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[violation.severity]}`}>
              {violation.severity}
            </span>
            <span className="text-sm font-medium text-gray-700 capitalize">{violation.category}</span>
            {violation.fine_amount != null && parseFloat(violation.fine_amount) > 0 && (
              <span className="text-xs text-red-600 font-semibold ml-auto">
                Fine: ${parseFloat(violation.fine_amount).toFixed(2)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700">{violation.description}</p>
          {violation.remediation && (
            <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              <span className="font-medium">Required fix: </span>{violation.remediation}
            </p>
          )}

          {/* Side-by-side photos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Original Violation</p>
              {violation.image_url ? (
                <a href={violation.image_url} target="_blank" rel="noreferrer">
                  <img
                    src={violation.image_url}
                    alt="Violation"
                    className="w-full h-48 object-cover rounded-xl border hover:opacity-90 transition"
                  />
                </a>
              ) : (
                <div className="w-full h-48 rounded-xl border bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
                  No photo
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tenant's Fix Photo</p>
              {violation.fix_photo_url ? (
                <a href={violation.fix_photo_url} target="_blank" rel="noreferrer">
                  <img
                    src={violation.fix_photo_url}
                    alt="Fix"
                    className="w-full h-48 object-cover rounded-xl border hover:opacity-90 transition"
                  />
                </a>
              ) : (
                <div className="w-full h-48 rounded-xl border bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
                  No fix photo submitted
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirm}
              disabled={!!loading}
              className="flex-1 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition"
            >
              {loading === 'confirm' ? 'Confirming...' : 'Confirm Resolved'}
            </button>
            <button
              onClick={handleReject}
              disabled={!!loading}
              className="flex-1 py-2.5 text-sm font-semibold bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition"
            >
              {loading === 'reject' ? 'Rejecting...' : 'Reject Fix'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ViolationReviewModal;
