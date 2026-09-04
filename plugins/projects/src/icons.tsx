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

export function ProjectsIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg {...common}>
          <path d="M2 4.4h3.4l1 1.3h5.2v5.6H2z" fill={filled ? 'currentColor' : 'none'} />
          <path d="M5.2 13.4h8.6V7.9" />
        </svg>
  );
}
