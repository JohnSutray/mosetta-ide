import type { JSX } from 'preact';

export type IconName = 'tree' | 'search' | 'scripts' | 'problems' | 'terminal' | 'projects' | 'git';

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
    case 'tree':
      return (
        <svg {...common}>
          <path d="M1.8 3.4h4l1.2 1.6h7.2v7.6H1.8z" fill={filled ? 'currentColor' : 'none'} />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="6.9" cy="6.9" r="4.1" fill={filled ? 'currentColor' : 'none'} />
          <path d="M10 10l3.4 3.4" />
        </svg>
      );
    case 'scripts':
      return (
        <svg {...common}>
          <rect x="2" y="2.6" width="12" height="10.8" rx="2" fill={filled ? 'currentColor' : 'none'} />
          <path d="M6.6 5.9l3.6 2.1-3.6 2.1z" fill={filled ? 'var(--panel-bg)' : 'currentColor'} stroke="none" />
        </svg>
      );
    case 'problems':
      return (
        <svg {...common}>
          <path d="M8 2.3l6 10.4H2z" fill={filled ? 'currentColor' : 'none'} />
          <path d="M8 6.4v2.6" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
          <path d="M8 10.9v.1" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
        </svg>
      );
    case 'projects':
      return (
        <svg {...common}>
          <path d="M2 4.4h3.4l1 1.3h5.2v5.6H2z" fill={filled ? 'currentColor' : 'none'} />
          <path d="M5.2 13.4h8.6V7.9" />
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
