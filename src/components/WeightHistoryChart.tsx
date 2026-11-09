import type { PetWeightEntry } from '@/types/database';
import { prepareWeightHistory, weightChartDomain, weightTimePositions } from '@/lib/weight-history';

export function WeightHistoryChart({ petName, entries }: { petName: string; entries: PetWeightEntry[] }) {
  const history = prepareWeightHistory(entries);
  if (history.length === 0) {
    return <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-400">No valid weight entries yet.</p>;
  }

  const { low, high } = weightChartDomain(history)!;
  const range = high - low;
  const width = 360;
  const timePositions = weightTimePositions(history);
  const positions = history.map((entry, index) => ({
    ...entry,
    x: timePositions[index],
    y: 130 - ((entry.weight_lbs - low) / range) * 100,
  }));
  const line = positions.map((point) => `${point.x},${point.y}`).join(' ');
  const first = positions[0];
  const latest = positions.at(-1)!;
  const change = history.length > 1 ? latest.weight_lbs - first.weight_lbs : 0;

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-obsidian-900/70 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><span className="text-xs text-zinc-400">Latest recorded</span><strong className="ml-2 font-mono text-lg text-white">{latest.weight_lbs.toFixed(1)} lb</strong></div>
        <span className="text-xs text-zinc-400">{history.length > 1 ? `${change >= 0 ? '+' : ''}${change.toFixed(1)} lb since ${first.date}` : 'One observation · no trend yet'}</span>
      </div>
      {history.length > 1 ? (
        <div role="img" aria-label={`${petName} weight history from ${first.date} at ${first.weight_lbs.toFixed(1)} pounds to ${latest.date} at ${latest.weight_lbs.toFixed(1)} pounds. Chart range ${low.toFixed(1)} to ${high.toFixed(1)} pounds.`}>
          <svg viewBox={`0 0 ${width} 160`} className="mt-3 h-40 w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            {[30, 80, 130].map((y) => <line key={y} x1="38" x2="328" y1={y} y2={y} stroke="#4c4658" strokeDasharray="3 5" />)}
            <text x="3" y="34" fill="#a1a1aa" fontSize="11">{high.toFixed(1)}</text>
            <text x="3" y="134" fill="#a1a1aa" fontSize="11">{low.toFixed(1)}</text>
            <polyline points={line} fill="none" stroke="#8B95FF" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            {positions.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="#8B95FF"><title>{`${point.date}: ${point.weight_lbs.toFixed(1)} lb`}</title></circle>)}
          </svg>
          <div className="flex justify-between px-1 text-xs text-zinc-400"><span>{first.date}</span><span>{latest.date}</span></div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500">Pounds · demo pet profile. Horizontal spacing follows elapsed days; vertical scale: {low.toFixed(1)}–{high.toFixed(1)} lb.</p>
    </div>
  );
}
