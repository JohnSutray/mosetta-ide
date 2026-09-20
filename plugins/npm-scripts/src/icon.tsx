import type { JSX } from 'preact';

/**
 * The npm icon, our own, belonging to the plugin.
 *
 * It used to live in the core's icon set, which meant the core carried somebody else's
 * mark for the sake of one plugin. Now it is brought by whoever needs it.
 *
 * The only toolbar icon with a COLOUR of its own, and that is deliberate: npm is
 * somebody else's mark, and a mark is recognised by colour before shape. Our icons are
 * monochrome and take their colour from the button.
 *
 * Square rather than the wide wordmark. A toolbar button has its own rounded backing,
 * and a wide red plate on top of it read as a second button crammed into the first: two
 * rounded rectangles of almost the same width. What was missing was not padding but a
 * DIFFERENCE IN SIZE. The square form with a white "n" is npm's second official mark,
 * and at sixteen pixels it reads better than the wordmark, where three letters two
 * pixels wide each turn into mush.
 */
export function NpmIcon(filled: boolean): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.6" fill={filled ? '#e0524f' : '#cb3837'} />
      <path d="M4.6 5h6.8v6h-1.7V6.6H6.3V11H4.6z" fill="#fff" />
    </svg>
  );
}

/**
 * The package manager's icon — a box.
 *
 * Not npm's mark: the badge holds the NAME of the current manager, and that may be
 * pnpm, or yarn, or bun. A little red square next to the word "pnpm" is exactly the
 * sort of small lie that is rarely noticed and never forgotten. A box is true for all
 * of them: it is what packages are installed with.
 *
 * Monochrome, taking its colour from the badge, like all our icons.
 */
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
