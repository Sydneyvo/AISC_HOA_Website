// Circular progress ring showing the community-wide average compliance score.
// Uses SVG stroke-dasharray/dashoffset to draw a colored arc proportional to score/100.
export default function AvgScoreRing({ score }) {
  const radius = 40;
  const stroke = 7;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;

  const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="flex flex-col items-center">
      <svg width={96} height={96} viewBox="0 0 96 96">
        {/* background track */}
        <circle
          cx={48} cy={48} r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        {/* colored progress arc — starts at top (rotate -90deg) */}
        <circle
          cx={48} cy={48} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={circumference / 4}   // rotate start point to 12 o'clock
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        {/* score label */}
        <text
          x={48} y={44}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={22}
          fontWeight="bold"
          fill={color}
        >
          {score}
        </text>
        <text
          x={48} y={62}
          textAnchor="middle"
          fontSize={9}
          fill="#9ca3af"
          letterSpacing="0.05em"
        >
          AVG SCORE
        </text>
      </svg>
    </div>
  );
}
