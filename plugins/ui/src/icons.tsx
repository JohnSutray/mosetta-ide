import type { JSX } from 'preact';

/**
 * The toolbar's icons.
 *
 * Each has two states: outlined means the feature is closed, filled means open. That is
 * not decoration but part of the rule: what the toolbar shows has to correspond
 * reactively to a feature's state, and "filled or not" reads at a glance, before the
 * backing does.
 */

export type IconName =
  | 'editor'
  | 'terminal'
  | 'git'
  | 'push'
  | 'fetch'
  | 'book';

interface Props {
  name: IconName;
  filled: boolean;
}

export function Icon({ name, filled }: Props): JSX.Element {
  const stroke = 1.6;
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': stroke,
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
  };

  switch (name) {
    case 'editor':
      return (
        <svg {...common}>
          <rect x="3" y="2" width="10" height="12" rx="1.4" fill={filled ? 'currentColor' : 'none'} />
          <path d="M5.4 5.6h5.2M5.4 8h5.2M5.4 10.4h3" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
        </svg>
      );
    case 'push':
      return (
        <svg {...common}>
          <path d="M8 12.6V3.4" />
          <path d="M4.4 6.9 8 3.3l3.6 3.6" fill={filled ? 'currentColor' : 'none'} />
          <path d="M2.6 13.6h10.8" />
        </svg>
      );
    case 'fetch':
      return (
        <svg {...common} stroke="#6897bb">
          <path d="M12.6 3.4 4.2 11.8" />
          <path d="M4 7.4v4.6h4.6" fill={filled ? '#6897bb' : 'none'} />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M2.4 3.2h3.9c1 0 1.7.5 1.7 1.2v8.2c0-.6-.7-1-1.7-1H2.4z" fill={filled ? 'currentColor' : 'none'} />
          <path d="M13.6 3.2H9.7c-1 0-1.7.5-1.7 1.2v8.2c0-.6.7-1 1.7-1h3.9z" fill={filled ? 'currentColor' : 'none'} />
        </svg>
      );
    case 'git':
      return (
        <svg {...common}>
          <path d="M5 2.6v10.8" />
          <circle cx="5" cy="3.4" r="1.5" fill={filled ? 'currentColor' : 'none'} />
          <circle cx="5" cy="12.6" r="1.5" fill={filled ? 'currentColor' : 'none'} />
          <circle cx="11.4" cy="5.2" r="1.5" fill={filled ? 'currentColor' : 'none'} />
          <path d="M11.4 6.7c0 2.4-2 3.2-4.4 3.6" />
        </svg>
      );
    case 'terminal':
      return (
        <svg {...common}>
          <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2" fill={filled ? 'currentColor' : 'none'} />
          <path d="M4.6 6.2l2 1.8-2 1.8" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
          <path d="M8.6 10.2h3" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
        </svg>
      );
  }
}
