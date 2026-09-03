import type { JSX } from 'preact';

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

export function SearchIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg {...common}>
          <circle cx="6.9" cy="6.9" r="4.1" fill={filled ? 'currentColor' : 'none'} />
          <path d="M10 10l3.4 3.4" />
        </svg>
  );
}
