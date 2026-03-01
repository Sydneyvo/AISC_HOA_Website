import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProperty, uploadRulesPdf, payBill } from '../api';
import ComplianceScore from '../components/ComplianceScore';
import ViolationRow    from '../components/ViolationRow';

const CATEGORIES = ['parking', 'garbage', 'lawn', 'exterior', 'structure', 'other'];
const SEV_ORDER  = { high: 0, medium: 1, low: 2 };

const pill = (active) =>
  `px-3 py-1 rounded-full text-xs font-medium transition ${
    active ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
  }`;

const billStatusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid:    'bg-green-100 text-green-800',
};

function fmt(amount) {
  return `$${parseFloat(amount ?? 0).toFixed(2)}`;
}

function fmtMonth(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
}

export default function PropertyDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [payingBill, setPayingBill] = useState(null);

  const [statusFilter,   setStatusFilter]   = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy,         setSortBy]         = useState('date_desc');

  const reload = () => getProperty(id).then(setProperty);

  useEffect(() => {
    reload().then(() => setLoading(false));
  }, [id]);

  const handleResolved = (violationId) => {
    setProperty(prev => ({
      ...prev,
      violations: prev.violations.map(v =>
        v.id === violationId ? { ...v, status: 'resolved' } : v
      ),
    }));
    reload();
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await uploadRulesPdf(id, file);
    if (result.success) {
      alert(result.changed ? 'HOA rules PDF updated!' : result.message);
      reload();
    } else {
      alert('Upload failed: ' + result.error);
    }
    e.target.value = '';
  };

  const handlePayBill = async (billId) => {
    setPayingBill(billId);
    try {
      await payBill(billId);
      reload();
    } catch (err) {
      alert('Failed to mark as paid: ' + err.message);
    } finally {
      setPayingBill(null);
    }
  };

  const filteredViolations = useMemo(() => {
    if (!property?.violations) return [];
    let list = [...property.violations];

    if (statusFilter   !== 'all') list = list.filter(v => v.status   === statusFilter);
    if (severityFilter !== 'all') list = list.filter(v => v.severity === severityFilter);
    if (categoryFilter !== 'all') list = list.filter(v => v.category === categoryFilter);

    list.sort((a, b) => {
      if (sortBy === 'date_desc')  return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'date_asc')   return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'sev_desc')   return SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      if (sortBy === 'sev_asc')    return SEV_ORDER[b.severity] - SEV_ORDER[a.severity];
      return 0;
    });

    return list;
  }, [property?.violations, statusFilter, severityFilter, categoryFilter, sortBy]);

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!property || property.error) return <div className="p-8 text-red-500">Property not found.</div>;

  const openCount      = property.violations?.filter(v => v.status === 'open').length ?? 0;
  const totalCount     = property.violations?.length ?? 0;
  const displayScore   = property.combined_score ?? property.compliance_score;
  const financialScore = property.financial_score ?? 100;
  const bills          = property.bills ?? [];
  const totalOwed      = bills
    .filter(b => b.status !== 'paid')
    .reduce((s, b) => s + parseFloat(b.total_amount ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">

      <Link to="/" className="text-blue-600 text-sm hover:underline">
        ← Back to Dashboard
      </Link>

      {/* Property Header Card */}
      <div className="bg-white rounded-xl border p-6 flex items-start gap-6">
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <ComplianceScore score={displayScore} size="lg" />
          <p className="text-xs text-gray-400 text-center leading-tight mt-1">Combined</p>
        </div>

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

          {/* Score breakdown + property stats */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full font-medium">
              Compliance {property.compliance_score}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
              financialScore >= 75 ? 'bg-green-50 text-green-700 border-green-200'
              : financialScore >= 50 ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
              : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              Financial {financialScore}
            </span>
            {property.land_area_sqft && (
              <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded-full font-medium">
                {parseFloat(property.land_area_sqft).toLocaleString()} sqft · ${(parseFloat(property.land_area_sqft) * 0.05).toFixed(2)}/mo base
              </span>
            )}
            {openCount > 0 && (
              <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded-full font-medium">
                {openCount} open violation{openCount !== 1 ? 's' : ''}
              </span>
            )}
            {totalOwed > 0 && (
              <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-full font-medium">
                {fmt(totalOwed)} outstanding
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-3">
            <label className="text-sm text-blue-600 cursor-pointer hover:underline font-medium">
              {property.rules_pdf_url ? 'Replace HOA Rules PDF' : 'Upload HOA Rules PDF'}
              <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
            </label>
            {property.rules_pdf_url && (
              <a href={property.rules_pdf_url} target="_blank" rel="noreferrer"
                className="text-sm text-gray-400 hover:underline">
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
        <div className="px-6 py-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Violation History</h2>
            <span className="text-sm text-gray-400">
              {filteredViolations.length} of {totalCount} shown
            </span>
          </div>

          {totalCount > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1">
                {['all', 'open', 'resolved'].map(s => (
                  <button key={s} className={pill(statusFilter === s)} onClick={() => setStatusFilter(s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {['all', 'low', 'medium', 'high'].map(s => (
                  <button key={s} className={pill(severityFilter === s)} onClick={() => setSeverityFilter(s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="border rounded-full px-3 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
              >
                <option value="all">All categories</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="border rounded-full px-3 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50 ml-auto"
              >
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="sev_desc">Severity: high → low</option>
                <option value="sev_asc">Severity: low → high</option>
              </select>
            </div>
          )}
        </div>

        {!totalCount ? (
          <p className="p-6 text-gray-400 text-sm">No violations recorded yet.</p>
        ) : filteredViolations.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">No violations match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Fine</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredViolations.map(v => (
                  <ViolationRow key={v.id} violation={v} onResolved={handleResolved} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Billing History</h2>
          {totalOwed > 0 && (
            <span className="text-sm font-semibold text-red-600">{fmt(totalOwed)} outstanding</span>
          )}
        </div>

        {bills.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">No bills yet — bills are generated on the 1st of each month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="py-3 px-4">Month</th>
                  <th className="py-3 px-4">Base</th>
                  <th className="py-3 px-4">Fines</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bills.map(bill => (
                  <tr key={bill.id} className="hover:bg-gray-50 text-sm">
                    <td className="py-3 px-4 font-medium">{fmtMonth(bill.billing_month)}</td>
                    <td className="py-3 px-4 text-gray-600">{fmt(bill.base_amount)}</td>
                    <td className="py-3 px-4 text-gray-600">{fmt(bill.violation_fines)}</td>
                    <td className="py-3 px-4 font-semibold">{fmt(bill.total_amount)}</td>
                    <td className="py-3 px-4 text-gray-600">{fmtDate(bill.due_date)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${billStatusColors[bill.status]}`}>
                        {bill.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {bill.status !== 'paid' ? (
                        <button
                          disabled={payingBill === bill.id}
                          onClick={() => handlePayBill(bill.id)}
                          className="px-3 py-1 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                        >
                          {payingBill === bill.id ? 'Saving...' : 'Mark Paid'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">{fmtDate(bill.paid_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
