import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProperty, uploadRulesPdf } from '../api';
import ComplianceScore from '../components/ComplianceScore';
import ViolationRow    from '../components/ViolationRow';

export default function PropertyDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getProperty(id).then(data => { setProperty(data); setLoading(false); });
  }, [id]);

  const handleResolved = (violationId) => {
    // Optimistic UI update, then refetch for accurate compliance score
    setProperty(prev => ({
      ...prev,
      violations: prev.violations.map(v =>
        v.id === violationId ? { ...v, status: 'resolved' } : v
      ),
    }));
    getProperty(id).then(setProperty);
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await uploadRulesPdf(id, file);
    if (result.success) {
      alert(result.changed ? 'HOA rules PDF updated!' : result.message);
      getProperty(id).then(setProperty);
    } else {
      alert('Upload failed: ' + result.error);
    }
    // Reset the input so the same file can be re-selected if needed
    e.target.value = '';
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!property || property.error) return <div className="p-8 text-red-500">Property not found.</div>;

  const openCount = property.violations?.filter(v => v.status === 'open').length ?? 0;

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">

      {/* Breadcrumb */}
      <Link to="/" className="text-blue-600 text-sm hover:underline">
        ← Back to Dashboard
      </Link>

      {/* Property Header Card */}
      <div className="bg-white rounded-xl border p-6 flex items-start gap-6">
        <ComplianceScore score={property.compliance_score} size="lg" />

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-blue-900">{property.address}</h1>
          <p className="text-gray-700 mt-1 font-medium">{property.owner_name}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {property.owner_email}
            {property.owner_phone && ` · ${property.owner_phone}`}
          </p>
          {property.resident_since && (
            <p className="text-sm text-gray-400 mt-0.5">Resident since {property.resident_since}</p>
          )}
          <p className="text-sm text-gray-500 mt-2">
            {openCount} open violation{openCount !== 1 ? 's' : ''}
          </p>

          {/* PDF upload */}
          <div className="flex items-center gap-3 mt-3">
            <label className="text-sm text-blue-600 cursor-pointer hover:underline font-medium">
              {property.rules_pdf_url ? 'Replace HOA Rules PDF' : 'Upload HOA Rules PDF'}
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />
            </label>
            {property.rules_pdf_url && (
              <a
                href={property.rules_pdf_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-gray-400 hover:underline"
              >
                View PDF ↗
              </a>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate(`/properties/${id}/violations/new`)}
          className="bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-800 transition flex-shrink-0"
        >
          Report Violation
        </button>
      </div>

      {/* Violations Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Violation History</h2>
          <span className="text-sm text-gray-400">
            {property.violations?.length ?? 0} total
          </span>
        </div>

        {!property.violations?.length ? (
          <p className="p-6 text-gray-400 text-sm">No violations recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {property.violations.map(v => (
                  <ViolationRow key={v.id} violation={v} onResolved={handleResolved} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
