import type { JSX } from 'preact';

/**
 * The keys window's icon, its own. A keyboard: three rows of keys and a space bar.
 * Filled means the window is open.
 */
const common = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.6,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
};

export function KeysIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg {...common}>
          <rect x="1.4" y="4" width="13.2" height="8" rx="1.4" fill={filled ? 'currentColor' : 'none'} />
          <path
            d="M4 6.6h.01M6.6 6.6h.01M9.2 6.6h.01M11.8 6.6h.01M5 9.4h6"
            stroke={filled ? 'var(--bg)' : 'currentColor'}
          />
        </svg>
  );
}
