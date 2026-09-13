import type { KeyHost, KeyOs } from './types.js';

export function HostIcon({ host }: { host: KeyHost }) {
  if (host === 'browser') {
    return (
      <svg width={13} height={13} viewBox="0 0 12 12" fill="currentColor">
        <path d="M5.23 11.45A5.5 5.5 0 0 1 0.9 3.94L3.17 4.86A3.05 3.05 0 0 0 5.58 9.02Z" />
        <path d="M1.67 2.61A5.5 5.5 0 0 1 10.33 2.61L8.4 4.12A3.05 3.05 0 0 0 3.6 4.12Z" />
        <path d="M11.1 3.94A5.5 5.5 0 0 1 6.77 11.45L6.42 9.02A3.05 3.05 0 0 0 8.83 4.86Z" />
        <circle cx={6} cy={6} r={1.95} />
      </svg>
    );
  }
  return (
    <svg width={13} height={13} viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width={1.2}>
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
    <svg width={13} height={13} viewBox="0 0 12 12" fill="currentColor" fill-rule="evenodd">
      <path d="M4.4 10.2C4.1 11.25 3 11.85 1.85 11.8 1.25 11.78 1.2 11.3 1.75 11c.95-.5 1.85-1 2.35-1.45zM7.6 10.2c.3 1.05 1.4 1.65 2.55 1.6.6-.02.65-.5.1-.8-.95-.5-1.85-1-2.35-1.45z" />
      <path d="M6 .85c1.3 0 2.1 1 2.1 2.15 0 .7-.2 1.15-.45 1.45 1.3.7 2.05 2.4 2.05 3.9 0 1.6-1.35 2.4-3.7 2.4s-3.7-.8-3.7-2.4c0-1.5.75-3.2 2.05-3.9-.25-.3-.45-.75-.45-1.45C3.9 1.85 4.7.85 6 .85ZM6 5.5c-1.05 0-1.85 1.25-1.85 2.75 0 1.2.7 1.85 1.85 1.85s1.85-.65 1.85-1.85C7.85 6.75 7.05 5.5 6 5.5ZM5.32 2.3a.46.46 0 0 0-.47.47c0 .26.21.47.47.47a.46.46 0 0 0 .46-.47.46.46 0 0 0-.46-.47ZM6.68 2.3a.46.46 0 0 0-.47.47c0 .26.21.47.47.47a.46.46 0 0 0 .46-.47.46.46 0 0 0-.46-.47ZM6 3.3c-.65 0-1.15.3-1.15.65 0 .45.55.8 1.15.8s1.15-.35 1.15-.8c0-.35-.5-.65-1.15-.65Z" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width={1.1}>
      <path d="M2.4 3.3h7.2" stroke-linecap="round" />
      <path d="M4.7 3.3V2.2h2.6v1.1" />
      <path d="M3.4 3.3l.5 6.1c0 .3.3.5.6.5h3c.3 0 .6-.2.6-.5l.5-6.1" stroke-linejoin="round" />
      <path d="M5.1 5.2v3M6.9 5.2v3" stroke-linecap="round" />
    </svg>
  );
}

export function RevertIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width={1.1}>
      <path d="M2.6 6a3.6 3.6 0 1 0 1.1-2.6" stroke-linecap="round" />
      <path d="M2.1 1.9v2.2h2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
