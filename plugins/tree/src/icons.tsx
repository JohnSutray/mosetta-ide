import type { JSX } from 'preact';

/**
 * The tree's own icons.
 *
 * The folder and the crosshair moved over from the widgets plugin along with the only
 * buttons of their own. Monochrome, taking their colour from the button; filled when
 * the panel is open or the setting is on.
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

export function TreeIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg {...common}>
      <path d="M1.8 3.4h4l1.2 1.6h7.2v7.6H1.8z" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}

/**
 * The crosshair: the tree "takes aim" at the open file. The same metaphor as in IDEA,
 * and it reads without a caption — a circle with a cross means "show me where I am".
 */
export function FollowIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="3.2" fill={filled ? 'currentColor' : 'none'} />
      <path d="M8 1.4v2.2M8 12.4v2.2M1.4 8h2.2M12.4 8h2.2" />
    </svg>
  );
}
