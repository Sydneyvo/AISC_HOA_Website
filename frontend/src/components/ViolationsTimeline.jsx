import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={7}
      fill={COLORS[payload.severity] || '#6b7280'}
      stroke="white"
      strokeWidth={1.5}
      opacity={payload.status === 'resolved' ? 0.35 : 1}
    />
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm max-w-xs">
      <p className="font-semibold text-gray-900">{d.property_address}</p>
      <p className="text-gray-500 capitalize mt-0.5">{d.category} · {d.severity}</p>
      <p className="text-gray-400 text-xs mt-0.5">
        {new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
      <p className={`text-xs font-semibold mt-1 ${d.status === 'resolved' ? 'text-green-600' : 'text-orange-600'}`}>
        {d.status}
      </p>
    </div>
  );
};

export default function ViolationsTimeline({ violations }) {
  const data = violations.map(v => ({
    ...v,
    x: new Date(v.created_at).getTime(),
    y: 1 + (Math.random() * 0.4 - 0.2),  // slight jitter so overlapping dots are visible
  }));

  const formatDate = (ts) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Community Violations Timeline</h2>
      <p className="text-sm text-gray-400 mb-4">Every violation logged across all properties</p>

      <ResponsiveContainer width="100%" height={140}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={['auto', 'auto']}
            tickFormatter={formatDate}
            scale="time"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis dataKey="y" type="number" hide domain={[0.5, 1.5]} />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Scatter data={data} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>

      <div className="flex gap-5 mt-2 text-xs text-gray-500">
        {[
          { label: 'High', color: 'bg-red-500' },
          { label: 'Medium', color: 'bg-yellow-500' },
          { label: 'Low', color: 'bg-green-500' },
          { label: 'Resolved', color: 'bg-gray-400 opacity-40' },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${color} inline-block`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
