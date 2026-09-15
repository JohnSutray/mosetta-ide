import type { JSX } from 'preact';

export function NpmIcon(filled: boolean): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.6" fill={filled ? '#e0524f' : '#cb3837'} />
      <path d="M4.6 5h6.8v6h-1.7V6.6H6.3V11H4.6z" fill="#fff" />
    </svg>
  );
}

export function PackageIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M8 2.2 13.8 5v6L8 13.8 2.2 11V5z" />
      <path d="M2.2 5 8 7.8 13.8 5" />
      <path d="M8 7.8v6" />
    </svg>
  );
}
