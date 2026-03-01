import { useState, useEffect } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { flagViolationFixed, tenantPayBill, getCommunityUnreadCount } from '../api';
import CommunityBoard from '../components/CommunityBoard';

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high:   'bg-red-100 text-red-800',
};

const BILL_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid:    'bg-green-100 text-green-800',
};

function fmt(amount) {
  return `$${parseFloat(amount ?? 0).toFixed(2)}`;
}

function fmtMonth(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function scoreColor(score) {
  if (score >= 80) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

export default function TenantDashboard({ initialData }) {
  const [violations, setViolations] = useState(initialData.violations || []);
  const [bills, setBills]           = useState(initialData.bills       || []);
  const [flagging, setFlagging]     = useState(null);
  const [paying, setPaying]         = useState(null);
  const [activeTab, setActiveTab]       = useState('property');
  const [communityUnread, setCommunityUnread] = useState(false);

  useEffect(() => {
    const since = localStorage.getItem('community_last_seen');
    getCommunityUnreadCount(since).then(({ count }) => setCommunityUnread(count > 0)).catch(() => {});
  }, []);

  const property = initialData.property;
  const score    = property.combined_score ?? property.compliance_score;

  const handleFlagFixed = async (violId) => {
    setFlagging(violId);
    try {
      const updated = await flagViolationFixed(violId);
      setViolations(vs => vs.map(v => v.id === violId ? updated : v));
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setFlagging(null);
    }
  };

  const handlePayBill = async (billId) => {
    setPaying(billId);
    try {
      const updated = await tenantPayBill(billId);
      setBills(bs => bs.map(b => b.id === billId ? updated : b));
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setPaying(null);
    }
  };

  const openViolations    = violations.filter(v => v.status === 'open');
  const pendingViolations = violations.filter(v => v.status === 'pending_review');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between">
        <span className="font-bold text-lg">HOA Compliance — My Property</span>
        <UserButton />
      </nav>

      <div className="max-w-3xl mx-auto p-8">

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('property')}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition ${
              activeTab === 'property' ? 'bg-white shadow text-blue-900' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            My Property
          </button>
          <button
            onClick={() => setActiveTab('community')}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition relative ${
              activeTab === 'community' ? 'bg-white shadow text-blue-900' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Community
            {communityUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        </div>

        {activeTab === 'property' ? (
          <div className="space-y-6">

            {/* Property Header */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-blue-900">{property.address}</h1>
                  <p className="text-gray-600 mt-1">{property.owner_name}</p>
                  <p className="text-sm text-gray-400 mt-0.5">{property.owner_email}</p>
                </div>
                <span className={`text-lg font-bold px-4 py-2 rounded-xl border flex-shrink-0 ${scoreColor(score)}`}>
                  Score: {score}
                </span>
              </div>
            </div>

            {/* Open Violations */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Open Violations</h2>
                {openViolations.length > 0 && (
                  <span className="text-sm text-orange-600 font-medium">{openViolations.length} open</span>
                )}
              </div>
              {openViolations.length === 0 ? (
                <p className="p-6 text-gray-400 text-sm">No open violations — great work!</p>
              ) : (
                <div className="divide-y">
                  {openViolations.map(v => (
                    <div key={v.id} className="p-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[v.severity]}`}>
                          {v.severity}
                        </span>
                        <span className="text-sm font-medium text-gray-800 capitalize">{v.category}</span>
                        {v.fine_amount != null && parseFloat(v.fine_amount) > 0 && (
                          <span className="text-xs text-red-600 font-semibold ml-auto">
                            Fine: {fmt(v.fine_amount)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{v.description}</p>
                      {v.remediation && (
                        <div className="text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                          <span className="font-medium">How to fix: </span>{v.remediation}
                        </div>
                      )}
                      <button
                        disabled={flagging === v.id}
                        onClick={() => handleFlagFixed(v.id)}
                        className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                      >
                        {flagging === v.id ? 'Submitting...' : "I've fixed this"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Review Violations */}
            {pendingViolations.length > 0 && (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h2 className="font-semibold text-gray-600">Awaiting Admin Review</h2>
                </div>
                <div className="divide-y">
                  {pendingViolations.map(v => (
                    <div key={v.id} className="p-6 space-y-1 opacity-70">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[v.severity]}`}>
                          {v.severity}
                        </span>
                        <span className="text-sm font-medium text-gray-700 capitalize">{v.category}</span>
                      </div>
                      <p className="text-sm text-gray-600">{v.description}</p>
                      <p className="text-xs text-blue-600 font-medium pt-1">
                        Submitted for review — admin will confirm
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bills */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-gray-800">Monthly Bills</h2>
              </div>
              {bills.length === 0 ? (
                <p className="p-6 text-gray-400 text-sm">No bills yet.</p>
              ) : (
                <div className="divide-y">
                  {bills.map(bill => (
                    <div key={bill.id} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">{fmtMonth(bill.billing_month)}</p>
                        <p className="text-sm text-gray-500">
                          Base {fmt(bill.base_amount)}
                          {parseFloat(bill.violation_fines) > 0 && ` + fines ${fmt(bill.violation_fines)}`}
                          {' · '}Due {fmtDate(bill.due_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${BILL_STATUS_COLORS[bill.status]}`}>
                          {bill.status.toUpperCase()}
                        </span>
                        <span className="font-semibold text-gray-800">{fmt(bill.total_amount)}</span>
                        {bill.status !== 'paid' ? (
                          <button
                            disabled={paying === bill.id}
                            onClick={() => handlePayBill(bill.id)}
                            className="px-3 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                          >
                            {paying === bill.id ? 'Saving...' : 'Pay Now'}
                          </button>
                        ) : bill.paid_at ? (
                          <span className="text-xs text-gray-400">Paid {fmtDate(bill.paid_at)}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          <CommunityBoard
            currentUserEmail={property.owner_email}
            isAdmin={false}
            onViewed={() => setCommunityUnread(false)}
          />
        )}

      </div>
    </div>
  );
}
