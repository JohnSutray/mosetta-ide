import type { JSX } from 'preact';

export function FindFilesIcon({ filled = false }: { filled?: boolean }): JSX.Element {
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
      <path d="M2 3.5h5M2 7h3M2 10.5h3M2 14h7" />
      <circle cx="10.5" cy="8" r="3.2" fill={filled ? 'currentColor' : 'none'} />
      <path d="M12.9 10.4L15 12.5" />
    </svg>
  );
}
