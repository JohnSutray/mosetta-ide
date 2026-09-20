import type { JSX } from 'preact';

/**
 * The merge icon, its own. Two lines converge into one: two were arguing, and one goes
 * on. Monochrome, taking its colour from the button; filled when the screen is open.
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

export function MergeIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg {...common}>
          <path d="M3.2 2.4v3.2c0 2.2 1.8 2.6 4.8 2.6h4.8" />
          <path d="M12.8 2.4v3.2c0 2.2-1.8 2.6-4.8 2.6" />
          <path d="M8 8.2v5.4" />
          <circle cx="8" cy="13.4" r="1.4" fill={filled ? 'currentColor' : 'none'} />
        </svg>
  );
}
