import type { KeyHost } from './types.js';

export function HostIcon({ host }: { host: KeyHost }) {
  const common = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 } as const;
  if (host === 'browser') {
    return (
      <svg width={12} height={12} viewBox="0 0 12 12" {...common}>
        <rect x={1} y={2} width={10} height={8} rx={1.5} />
        <path d="M1 4.5h10" />
        <circle cx={2.6} cy={3.2} r={0.4} fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" {...common}>
      <rect x={1} y={2} width={10} height={8} rx={1.5} />
      <path d="M1 4.2h10" />
      <path d="M3.4 6.6h5.2" />
    </svg>
  );
}
