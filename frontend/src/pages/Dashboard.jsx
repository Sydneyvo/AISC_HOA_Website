import { useState, useEffect } from 'react';
import { getProperties, getViolationsTimeline, createProperty, deleteProperty, getFinance } from '../api';
import PropertyCard       from '../components/PropertyCard';
import ViolationsTimeline from '../components/ViolationsTimeline';
import AvgScoreRing       from '../components/AvgScoreRing';
import FinanceTable       from '../components/FinanceTable';

const EMPTY_FORM = {
  address: '', owner_name: '', owner_email: '', owner_phone: '', resident_since: '', land_area_sqft: ''
};

export default function Dashboard() {
  const [activeTab, setActiveTab]     = useState('properties');
  const [properties, setProperties]   = useState([]);
  const [timeline, setTimeline]       = useState([]);
  const [financeData, setFinanceData] = useState(null);
  const [search, setSearch]           = useState('');
  const [showAdd, setShowAdd]         = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    Promise.all([getProperties(), getViolationsTimeline()])
      .then(([props, tl]) => { setProperties(props); setTimeline(tl); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  // Lazy-load finance data when tab is first opened
  useEffect(() => {
    if (activeTab === 'finance' && !financeData) {
      getFinance().then(setFinanceData).catch(err => console.error('Finance load error:', err.message));
    }
  }, [activeTab, financeData]);

  const filtered = properties.filter(p =>
    p.address.toLowerCase().includes(search.toLowerCase()) ||
    p.owner_name.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = properties.filter(p => parseInt(p.open_violations) > 0).length;
  const avgScore  = properties.length
    ? Math.round(properties.reduce((s, p) => s + (p.combined_score ?? p.compliance_score), 0) / properties.length)
    : 100;

  const handleAdd = async (e) => {
    e.preventDefault();
    const created = await createProperty(form);
    setProperties(prev => [...prev, { ...created, open_violations: 0 }]);
    setShowAdd(false);
    setForm(EMPTY_FORM);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this property and all its violations?')) return;
    await deleteProperty(id);
    setProperties(prev => prev.filter(p => p.id !== id));
  };

  const handleBillPaid = () => {
    getFinance().then(setFinanceData);
  };

  if (loading) return <div className="p-8 text-gray-400">Loading properties...</div>;
  if (error)   return <div className="p-8 text-red-500">Failed to load: {error}</div>;

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-6 flex-1">
          <AvgScoreRing score={avgScore} />
          <div>
            <h1 className="text-3xl font-bold text-blue-900">HOA Compliance Dashboard</h1>
            <p className="text-gray-500 mt-1">
              {properties.length} properties ·{' '}
              {openCount} with open violations
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-800 transition flex-shrink-0"
        >
          + Add Property
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[['properties', 'Properties'], ['finance', 'Finance']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-md text-sm font-semibold transition ${
              activeTab === key
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'properties' && (
        <>
          {timeline.length > 0 && <ViolationsTimeline violations={timeline} />}

          <input
            className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Search by address or owner name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="space-y-3">
            {filtered.map(p => (
              <PropertyCard key={p.id} property={p} onDelete={handleDelete} />
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 py-12">
                {search ? 'No properties match your search.' : 'No properties yet. Add one above.'}
              </p>
            )}
          </div>
        </>
      )}

      {activeTab === 'finance' && (
        <FinanceTable data={financeData} onBillPaid={handleBillPaid} />
      )}

      {/* Add Property Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form
            onSubmit={handleAdd}
            className="bg-white rounded-xl p-8 w-full max-w-md space-y-4 shadow-xl"
          >
            <h2 className="text-xl font-bold text-blue-900">Add Property</h2>

            {[
              { name: 'address',        label: 'Address',               required: true },
              { name: 'owner_name',     label: 'Owner Name',            required: true },
              { name: 'owner_email',    label: 'Owner Email',           required: true, type: 'email' },
              { name: 'owner_phone',    label: 'Phone',                 required: false },
              { name: 'resident_since', label: 'Resident Since (year)', required: false, type: 'number' },
              { name: 'land_area_sqft', label: 'Land Area (sq ft)',     required: true,  type: 'number' },
            ].map(({ name, label, required, type = 'text' }) => (
              <div key={name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  required={required}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={form[name]}
                  onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
                />
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-800"
              >
                Add Property
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
