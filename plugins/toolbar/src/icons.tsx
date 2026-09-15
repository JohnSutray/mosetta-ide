import type { JSX } from 'preact';

export function DaemonIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" shape-rendering="geometricPrecision">
      <rect x="1.6" y="2.2" width="12.8" height="5" rx="1.6" fill="#6b7275" />
      <rect x="1.6" y="8.8" width="12.8" height="5" rx="1.6" fill="#6b7275" />
      <circle cx="4.6" cy="4.7" r="1.1" fill="#8fbf7a" />
      <circle cx="4.6" cy="11.3" r="1.1" fill="#8fbf7a" />
    </svg>
  );
}
