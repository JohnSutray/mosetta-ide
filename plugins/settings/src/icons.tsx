import type { JSX } from 'preact';

/**
 * A cogwheel: outlined means the window is closed, filled means open.
 *
 * The teeth are real rather than eight rays from the centre: as rays it read as a SUN.
 * A silhouette is recognised by the shape of its edge, so the edge is what we draw:
 * eight vertices at radius 7.35, the gaps as arcs of 4.95, and the hole as a second
 * contour with `evenodd`, so that it stays a hole when filled.
 */
const GEAR =
  'M6.72 0.76A7.35 7.35 0 0 1 9.28 0.76L9.32 3.23A4.95 4.95 0 0 1 10.44 3.69L12.22 1.98' +
  'A7.35 7.35 0 0 1 14.02 3.78L12.31 5.56A4.95 4.95 0 0 1 12.77 6.68L15.24 6.72' +
  'A7.35 7.35 0 0 1 15.24 9.28L12.77 9.32A4.95 4.95 0 0 1 12.31 10.44L14.02 12.22' +
  'A7.35 7.35 0 0 1 12.22 14.02L10.44 12.31A4.95 4.95 0 0 1 9.32 12.77L9.28 15.24' +
  'A7.35 7.35 0 0 1 6.72 15.24L6.68 12.77A4.95 4.95 0 0 1 5.56 12.31L3.78 14.02' +
  'A7.35 7.35 0 0 1 1.98 12.22L3.69 10.44A4.95 4.95 0 0 1 3.23 9.32L0.76 9.28' +
  'A7.35 7.35 0 0 1 0.76 6.72L3.23 6.68A4.95 4.95 0 0 1 3.69 5.56L1.98 3.78' +
  'A7.35 7.35 0 0 1 3.78 1.98L5.56 3.69A4.95 4.95 0 0 1 6.68 3.23Z' +
  'M10.5 8A2.5 2.5 0 0 1 5.5 8A2.5 2.5 0 0 1 10.5 8Z';

export function SettingsIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16">
      <path
        d={GEAR}
        fill-rule="evenodd"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width={1.1}
        stroke-linejoin="round"
      />
    </svg>
  );
}
