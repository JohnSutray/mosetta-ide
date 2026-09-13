import type { KeyHost, KeyOs } from './types.js';

export function HostIcon({ host }: { host: KeyHost }) {
  const common = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 } as const;
  if (host === 'browser') {
    return (
      <svg width={13} height={13} viewBox="0 0 12 12" {...common}>
        <rect x={1} y={2} width={10} height={8} rx={1.5} />
        <path d="M1 4.5h10" />
        <circle cx={2.6} cy={3.2} r={0.45} fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width={13} height={13} viewBox="0 0 12 12" {...common}>
      <rect x={1} y={2} width={10} height={8} rx={1.5} />
      <path d="M1 4.2h10" />
      <path d="M3.4 6.6h5.2" />
    </svg>
  );
}

export function OsIcon({ os }: { os: KeyOs }) {
  if (os === 'mac') {
    return (
      <svg width={13} height={13} viewBox="0 0 12 12" fill="currentColor">
        <path d="M6.5 2.6c.5-.1 1-.6 1.1-1.3-.6 0-1.2.4-1.4.9-.1.2-.1.4 0 .4z" />
        <path d="M8.9 8.6c-.3.7-.8 1.6-1.4 1.6-.5 0-.7-.3-1.3-.3s-.8.3-1.3.3c-.6 0-1.2-1-1.5-1.7-.6-1.4-.5-3.3.7-4 .4-.3.9-.4 1.3-.4.5 0 .8.3 1.2.3.4 0 .6-.3 1.2-.3.4 0 .9.2 1.2.5-1 .6-1.1 2.2-.1 3-.2.4-.3.7-.4 1z" />
      </svg>
    );
  }
  if (os === 'win') {
    return (
      <svg width={13} height={13} viewBox="0 0 12 12" fill="currentColor">
        <rect x={1.2} y={1.6} width={4.1} height={4.1} rx={0.4} />
        <rect x={6.7} y={1.6} width={4.1} height={4.1} rx={0.4} />
        <rect x={1.2} y={6.3} width={4.1} height={4.1} rx={0.4} />
        <rect x={6.7} y={6.3} width={4.1} height={4.1} rx={0.4} />
      </svg>
    );
  }
  return (
    <svg width={13} height={13} viewBox="0 0 12 12" fill="currentColor">
      <path d="M6 1c-1.5 0-2.5 1.1-2.5 2.6v.8c0 .6-1 1.7-1 3.2C2.5 9.2 4 10.2 6 10.2s3.5-1 3.5-2.6c0-1.5-1-2.6-1-3.2v-.8C8.5 2.1 7.5 1 6 1z" />
      <path
        d="M4.4 10.3 3 11.2M7.6 10.3 9 11.2"
        stroke="currentColor"
        stroke-width={1.3}
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  );
}
