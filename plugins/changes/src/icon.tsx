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

export function UnifiedIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.6" />
      <path d="M4.4 6h7.2M4.4 8.5h7.2M4.4 11h4.6" />
    </svg>
  );
}

export function SplitIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.6" />
      <path d="M8 3v10" />
      <path d="M3.6 6h3M3.6 8.5h3M9.4 6h3M9.4 8.5h3M9.4 11h2" />
    </svg>
  );
}

export function RefreshIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13 2.4V5h-2.6" />
    </svg>
  );
}
