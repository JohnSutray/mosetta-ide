import type { JSX } from 'preact';

/**
 * The daemon's icon — a rack with a lamp.
 *
 * A DRAWING rather than letters: toolbar badges come in two kinds, and here the shape
 * is recognised faster — "a piece of hardware that is working". Letters are for
 * languages, because that is how languages are recognised; a daemon is not a language.
 *
 * The same size and the same grid as the language server's icon next to it: the badges
 * stand in a row, and icons that have drifted read as different kinds of thing,
 * although the kind is one.
 */
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
