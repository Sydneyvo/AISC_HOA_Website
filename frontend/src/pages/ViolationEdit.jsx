import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getViolation, updateViolation } from '../api';

const CATEGORIES = ['parking', 'garbage', 'lawn', 'exterior', 'structure', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  high:   'bg-red-100 text-red-800 border-red-300',
};

export default function ViolationEdit() {
  const { id: propertyId, violId } = useParams();
  const navigate = useNavigate();

  const [form, setForm]         = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [noticeSentAt, setNoticeSentAt] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getViolation(violId).then(v => {
      setForm({
        category:      v.category      || 'other',
        severity:      v.severity      || 'low',
        description:   v.description   || '',
        rule_cited:    v.rule_cited    || '',
        remediation:   v.remediation   || '',
        deadline_days: v.deadline_days ?? 14,
      });
      setImageUrl(v.image_url || '');
      setNoticeSentAt(v.notice_sent_at);
      setLoading(false);
    }).catch(() => {
      alert('Failed to load violation.');
      navigate(`/properties/${propertyId}`);
    });
  }, [violId, propertyId, navigate]);

  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (sendEmail) => {
    if (!form.description.trim()) {
      alert('Please fill in a description before saving.');
      return;
    }
    setSubmitting(true);
    try {
      await updateViolation(violId, {
        ...form,
        deadline_days: parseInt(form.deadline_days),
        send_email: sendEmail,
      });
      navigate(`/properties/${propertyId}`);
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading violation...</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-blue-900">Edit Violation</h1>
        <Link to={`/properties/${propertyId}`} className="text-sm text-gray-400 hover:underline">
          Cancel
        </Link>
      </div>

      {noticeSentAt && (
        <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 text-sm">
          Notice was sent on {new Date(noticeSentAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
          You can resend it below if needed.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">

        {/* Left: photo */}
        <div>
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt="Violation"
                className="rounded-xl border w-full object-cover max-h-80"
              />
              <p className="text-xs text-gray-400 mt-2 text-center">Stored in Azure Blob Storage</p>
            </>
          ) : (
            <div className="rounded-xl border w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
              No photo on file
            </div>
          )}
        </div>

        {/* Right: editable form */}
        <div className="space-y-5">

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={form.category}
              onChange={update('category')}
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, severity: s }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition ${
                    form.severity === s
                      ? SEVERITY_STYLES[s]
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Text fields */}
          {[
            { field: 'description', label: 'Description',      rows: 3 },
            { field: 'rule_cited',  label: 'Rule Cited',        rows: 2 },
            { field: 'remediation', label: 'Remediation Steps', rows: 3 },
          ].map(({ field, label, rows }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                rows={rows}
                value={form[field]}
                onChange={update(field)}
              />
            </div>
          ))}

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deadline (days to resolve)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              className="border rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={form.deadline_days}
              onChange={update('deadline_days')}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="flex-1 bg-blue-700 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50 transition"
            >
              {submitting ? 'Saving...' : noticeSentAt ? 'Save & Resend Notice' : 'Save & Send Notice'}
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 disabled:opacity-50 transition"
            >
              Save Without Sending
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
