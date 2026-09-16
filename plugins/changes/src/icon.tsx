import type { JSX } from 'preact';

export function ChangesIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      shape-rendering="geometricPrecision"
    >
      <path
        d="M3.4 2.6a1 1 0 0 1 1-1h4.4l3 3v7.8a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1z"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path d="M5.6 8.4 7.2 10l3.2-3.4" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
    </svg>
  );
}
