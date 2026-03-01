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
  const [paying, setPaying] = useState(null);

  if (!data) return <div className="p-8 text-gray-400">Loading finance data...</div>;

  const { community_total_owed, overdue_count, all_properties = [] } = data;

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

      {/* Per-property bills */}
      {all_properties.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No properties found.</p>
      ) : (
        <div className="space-y-4">
          {all_properties.map(prop => {
            const unpaidBills = (prop.bills ?? []).filter(b => b.status !== 'paid');
            const isAllClear  = parseFloat(prop.total_owed) === 0;
            const score       = prop.combined_score ?? prop.compliance_score;
            const scoreColor  = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
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
                      {unpaidBills.map(bill => (
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
              </div>
            );
          })}
          {all_properties.every(p => parseFloat(p.total_owed) === 0) && (
            <p className="text-center text-green-600 py-12 font-medium">
              All properties are up to date — no outstanding balances.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
