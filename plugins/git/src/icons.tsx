import type { JSX } from 'preact';

export function BranchIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (

        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 2.6v10.8" />
          <circle cx="5" cy="3.4" r="1.5" fill={filled ? 'currentColor' : 'none'} />
          <circle cx="5" cy="12.6" r="1.5" fill={filled ? 'currentColor' : 'none'} />
          <circle cx="11.4" cy="5.2" r="1.5" fill={filled ? 'currentColor' : 'none'} />
          <path d="M11.4 6.7c0 2.4-2 3.2-4.4 3.6" />
        </svg>
  );
}

export function PushIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (

        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 12.6V3.4" />
          <path d="M4.4 6.9 8 3.3l3.6 3.6" fill={filled ? 'currentColor' : 'none'} />
          <path d="M2.6 13.6h10.8" />
        </svg>
  );
}
