import { useState } from 'react';
import { payBill } from '../api';

const statusColors = {
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

export default function FinanceTable({ data, onBillPaid }) {
  const [paying,       setPaying]       = useState(null);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy,       setSortBy]       = useState('owed_desc');
  const [expanded,     setExpanded]     = useState(new Set()); // property IDs with all bills shown

  const toggleExpand = (propId) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(propId) ? next.delete(propId) : next.add(propId);
    return next;
  });

  const MAX_BILLS = 2;

  if (!data) return <div className="p-8 text-gray-400">Loading finance data...</div>;

  const { community_total_owed, overdue_count, all_properties = [] } = data;

  let displayed = [...all_properties];

  if (search) {
    const q = search.toLowerCase();
    displayed = displayed.filter(p =>
      p.address.toLowerCase().includes(q) || p.owner_name.toLowerCase().includes(q)
    );
  }

  if (statusFilter === 'overdue') {
    displayed = displayed.filter(p => parseInt(p.overdue_count ?? 0) > 0);
  } else if (statusFilter === 'balance') {
    displayed = displayed.filter(p => parseFloat(p.total_owed) > 0 && parseInt(p.overdue_count ?? 0) === 0);
  } else if (statusFilter === 'clear') {
    displayed = displayed.filter(p => parseFloat(p.total_owed) === 0);
  }

  displayed.sort((a, b) => {
    if (sortBy === 'owed_desc') return parseFloat(b.total_owed ?? 0) - parseFloat(a.total_owed ?? 0);
    if (sortBy === 'overdue')   return parseInt(b.overdue_count ?? 0) - parseInt(a.overdue_count ?? 0);
    if (sortBy === 'name')      return a.address.localeCompare(b.address);
    if (sortBy === 'score')     return (a.combined_score ?? a.compliance_score ?? 100) - (b.combined_score ?? b.compliance_score ?? 100);
    return 0;
  });

  const handlePay = async (billId, propertyId) => {
    setPaying(billId);
    try {
      await payBill(billId);
      onBillPaid?.({ billId, propertyId });
    } catch (err) {
      alert('Failed to mark as paid: ' + err.message);
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Community summary bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Owed</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(community_total_owed)}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Overdue Bills</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{overdue_count}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Properties w/ Balance</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">
            {all_properties.filter(p => parseFloat(p.total_owed) > 0).length}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">All Clear</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {all_properties.filter(p => parseFloat(p.total_owed) === 0).length}
          </p>
        </div>
      </div>

      {/* Filter / sort controls */}
      <div className="flex gap-2 flex-wrap">
        <input
          className="flex-1 min-w-[180px] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Search by address or owner..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-2 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="all">All Properties</option>
          <option value="overdue">Overdue</option>
          <option value="balance">Has Balance</option>
          <option value="clear">Paid Up</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="border rounded-lg px-2 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="owed_desc">Sort: Most Owed</option>
          <option value="overdue">Sort: Overdue First</option>
          <option value="name">Sort: Name A–Z</option>
          <option value="score">Sort: Score Low–High</option>
        </select>
      </div>

      {/* Per-property bills */}
      {displayed.length === 0 ? (
        <p className="text-center text-gray-400 py-12">
          {search || statusFilter !== 'all' ? 'No properties match your filters.' : 'No properties found.'}
        </p>
      ) : (
        <div className="space-y-4">
          {displayed.map(prop => {
            const unpaidBills  = (prop.bills ?? []).filter(b => b.status !== 'paid');
            const isAllClear   = parseFloat(prop.total_owed) === 0;
            const score        = prop.combined_score ?? prop.compliance_score;
            const scoreColor   = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
            const isExpanded   = expanded.has(prop.id);
            const visibleBills = isExpanded ? unpaidBills : unpaidBills.slice(0, MAX_BILLS);
            const hiddenCount  = unpaidBills.length - MAX_BILLS;
            return (
              <div key={prop.id} className={`bg-white rounded-xl border overflow-hidden ${isAllClear ? 'opacity-60' : ''}`}>
                <div className="px-6 py-4 border-b flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800">{prop.address}</p>
                      {isAllClear && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">All Paid</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{prop.owner_name} · {prop.owner_email}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Score</p>
                      <p className={`text-lg font-bold ${scoreColor}`}>{score}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total owed</p>
                      <p className={`text-lg font-bold ${isAllClear ? 'text-green-600' : 'text-red-600'}`}>
                        {isAllClear ? 'Paid up' : fmt(prop.total_owed)}
                      </p>
                    </div>
                  </div>
                </div>
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
                      {visibleBills.map(bill => (
                        <tr key={bill.id} className="hover:bg-gray-50 text-sm">
                          <td className="py-3 px-4 font-medium">{fmtMonth(bill.billing_month)}</td>
                          <td className="py-3 px-4 text-gray-600">{fmt(bill.base_amount)}</td>
                          <td className="py-3 px-4 text-gray-600">{fmt(bill.violation_fines)}</td>
                          <td className="py-3 px-4 font-semibold">{fmt(bill.total_amount)}</td>
                          <td className="py-3 px-4 text-gray-600">{fmtDate(bill.due_date)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[bill.status]}`}>
                              {bill.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              disabled={paying === bill.id}
                              onClick={() => handlePay(bill.id, prop.id)}
                              className="px-3 py-1 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                            >
                              {paying === bill.id ? 'Saving...' : 'Mark Paid'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {unpaidBills.length > MAX_BILLS && (
                  <button
                    onClick={() => toggleExpand(prop.id)}
                    className="w-full py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition border-t"
                  >
                    {isExpanded
                      ? 'Show less ▲'
                      : `Show ${hiddenCount} more month${hiddenCount !== 1 ? 's' : ''} ▼`}
                  </button>
                )}
              </div>
            );
          })}
          {displayed.every(p => parseFloat(p.total_owed) === 0) && statusFilter === 'all' && !search && (
            <p className="text-center text-green-600 py-12 font-medium">
              All properties are up to date — no outstanding balances.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
