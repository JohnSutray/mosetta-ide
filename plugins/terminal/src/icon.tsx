import type { JSX } from 'preact';

export function TerminalIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2" fill={filled ? 'currentColor' : 'none'} />
      <path d="M4.6 6.2l2 1.8-2 1.8" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
      <path d="M8.6 10.2h3" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
    </svg>
  );
}
