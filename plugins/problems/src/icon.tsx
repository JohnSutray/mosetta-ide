import type { JSX } from 'preact';

export function ProblemsIcon(filled: boolean): JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width={1.6}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M8 2.3l6 10.4H2z" fill={filled ? 'currentColor' : 'none'} />
      <path d="M8 6.4v2.6" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
      <path d="M8 10.9v.1" stroke={filled ? 'var(--panel-bg)' : 'currentColor'} />
    </svg>
  );
}
