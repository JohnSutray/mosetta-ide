import type { JSX } from 'preact';

/** Text: three lines — the same as the editor shows. */
export function TextIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
    </svg>
  );
}

/** Text and view: two columns, the left one in lines, the right one solid. */
export function SplitIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.6" />
      <path d="M8 3v10" />
      <path d="M3.4 6h3.2M3.4 8.5h3.2M3.4 11h2" stroke-linecap="round" />
    </svg>
  );
}

/** The view: a page with a heading and text — what the markup will turn into. */
export function PreviewIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
      <rect x="2.5" y="2" width="11" height="12" rx="1.6" />
      <path d="M4.8 5.2h4.2" stroke-width="2" stroke-linecap="round" />
      <path d="M4.8 8.2h6.4M4.8 10.8h4.6" stroke-linecap="round" />
    </svg>
  );
}
