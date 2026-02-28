export default function ComplianceScore({ score, size = 'md' }) {
  const color = score >= 80
    ? 'text-green-600 bg-green-50 border-green-300'
    : score >= 50
    ? 'text-yellow-600 bg-yellow-50 border-yellow-300'
    : 'text-red-600 bg-red-50 border-red-300';

  const sz = size === 'lg'
    ? 'w-24 h-24 text-3xl font-bold'
    : 'w-14 h-14 text-lg font-bold';

  return (
    <div className={`${sz} ${color} border-2 rounded-full flex items-center justify-center flex-shrink-0`}>
      {score}
    </div>
  );
}
