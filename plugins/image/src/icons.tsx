import type { JSX } from 'preact';

/** The view: a frame with a "picture" inside — a sun and a hill. */
export function PictureIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.6" />
      <circle cx="5.6" cy="6.4" r="1.1" />
      <path d="M2.6 11.4 6 8.4l2.4 2 2-1.6 3 3" />
    </svg>
  );
}

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

/**
 * The backing: a chequerboard, the sign for transparency, the same one every graphics
 * editor uses. The icon is made of squares itself, otherwise it would have to be
 * explained in words.
 */
export function CheckerIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.6" stroke="currentColor" stroke-width="1.3" />
      <path d="M2.8 3.8h4.6v4.4H2.8zM7.4 8.2h5.8v4.2H7.4z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

/** The backing, dark and light — two halves of a circle. */
export function ContrastIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.3" />
      <path d="M8 2.6a5.4 5.4 0 0 1 0 10.8z" fill="currentColor" />
    </svg>
  );
}

/** Fit to the panel, and show pixel for pixel. */
export function FitIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 2.6H2.6V6M10 2.6h3.4V6M6 13.4H2.6V10M10 13.4h3.4V10" />
    </svg>
  );
}
