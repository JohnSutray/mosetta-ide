import type { JSX } from 'preact';
import { fileTypes, type FileType, type GlyphName } from './file-types.js';

/**
 * The tree's icons. The knowledge about languages lives in the file-types table; here
 * there are only the shapes.
 *
 * There are three shapes, and choosing between them is choosing what is more honest to
 * show:
 *
 * * a DRAWING where a shape is recognised faster than letters: a lock, a branch, an image, a terminal;
 * * a PLATE WITH LETTERS for languages: `TS` and `PY` are not drawn as pictures, that is how they are recognised — by their letters;
 * * a SHEET OF PAPER for the unfamiliar: it asserts nothing.
 *
 * The shape used to be one — a sheet with a tiny caption underneath — and the sheet
 * took two thirds of the space while saying nothing: every file is a file anyway.
 *
 * The 16-pixel size was not chosen by eye: it is the row height minus the air. The
 * caption is stretched with `textLength`, so two characters and three take one width
 * and the name column does not dance.
 */

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  'shape-rendering': 'geometricPrecision' as const,
};

const PAPER = '#4e5356';
const PAPER_EDGE = '#7b8386';

export function FileIcon({ name }: { name: string }): JSX.Element {
  const type = fileTypes.of(name);
  if (type.glyph) return <svg {...ICON}>{GLYPHS[type.glyph](type.color)}</svg>;
  if (type.label === '') return <svg {...ICON}>{paper()}</svg>;
  return <svg {...ICON}>{tile(type)}</svg>;
}

/**
 * A plate with letters. It used to be a caption ON a sheet of paper and became the icon
 * itself: the sheet took two thirds of the space and said nothing — every file is a
 * file anyway — while the caption got a narrow strip where three characters turned into
 * dirt.
 */
function tile(type: FileType): JSX.Element {
  const wide = type.label.length > 2;
  return (
    <>
      <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="3" fill={type.color} />
      <text
        x="8"
        y="8.6"
        textLength={wide ? 10 : 7.6}
        lengthAdjust="spacingAndGlyphs"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="'SF Pro Text', 'Segoe UI', Helvetica, sans-serif"
        font-size={wide ? 6 : 7.2}
        font-weight="700"
        fill={type.ink}
      >
        {type.label}
      </text>
    </>
  );
}

/** A sheet of paper with a folded corner — "just a file", as in IDEA. */
function paper(): JSX.Element {
  return (
    <>
      <path
        d="M3.6 2.2a1 1 0 0 1 1-1h4.6l3.2 3.2v8.4a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1z"
        fill={PAPER}
        stroke={PAPER_EDGE}
        stroke-width="1"
        stroke-linejoin="round"
      />
      <path d="M9.2 1.2v3.2h3.2" stroke={PAPER_EDGE} stroke-width="1" stroke-linejoin="round" />
    </>
  );
}

/**
 * Icons for the types where the SHAPE is recognised faster than two letters.
 *
 * There are few of them and they are drawn with lines of one weight — a set has to read
 * as a set rather than as a collection of somebody else's logos. There is one
 * exception: npm, because somebody else's mark is recognised by colour and shape before
 * it is recognised by meaning.
 */
const GLYPHS: Record<GlyphName, (color: string) => JSX.Element> = {
  lock: (color) => (
    <g stroke={color} stroke-width="1.4" fill="none" stroke-linecap="round">
      <rect x="3.2" y="7" width="9.6" height="7.2" rx="1.6" fill={color} stroke="none" />
      <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
    </g>
  ),
  git: (color) => (
    <g stroke={color} stroke-width="1.5" fill="none" stroke-linecap="round">
      <path d="M4.6 3v10" />
      <path d="M4.6 7.4h4a2.4 2.4 0 0 0 2.4-2.4" />
      <circle cx="4.6" cy="13.2" r="1.4" fill={color} stroke="none" />
      <circle cx="11.4" cy="4.2" r="1.4" fill={color} stroke="none" />
    </g>
  ),
  npm: (color) => (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6" fill={color} />
      <path d="M4.5 5h7v6h-1.8V6.6H6.3V11H4.5z" fill="#fff" />
    </>
  ),
  image: (color) => (
    <g stroke={color} stroke-width="1.4" fill="none" stroke-linejoin="round">
      <rect x="2.2" y="3.4" width="11.6" height="9.2" rx="1.6" />
      <circle cx="5.9" cy="6.6" r="1.1" fill={color} stroke="none" />
      <path d="M3 11.4 6.4 8.2l2.3 2.1 2.1-2 2.2 2.2" />
    </g>
  ),
  terminal: (color) => (
    <g stroke={color} stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.8" />
      <path d="M5 6.4 7.2 8.4 5 10.4" />
      <path d="M8.6 10.6h2.6" />
    </g>
  ),
  gear: (color) => (
    <g stroke={color} stroke-width="1.4" fill="none">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.9v1.8M8 12.3v1.8M1.9 8h1.8M12.3 8h1.8M3.7 3.7l1.3 1.3M11 11l1.3 1.3M12.3 3.7 11 5M5 11l-1.3 1.3" stroke-linecap="round" />
    </g>
  ),
  text: (color) => (
    <g stroke={color} stroke-width="1.4" fill="none" stroke-linecap="round">
      <path d="M3.4 4.2h9.2M3.4 7.2h9.2M3.4 10.2h6.2M3.4 13.2h4" />
    </g>
  ),
  archive: (color) => (
    <g stroke={color} stroke-width="1.4" fill="none" stroke-linejoin="round">
      <path d="M2.2 5.6h11.6v7.2a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2z" />
      <rect x="1.6" y="2.4" width="12.8" height="3.2" rx="1" />
      <path d="M6.6 8.6h2.8" stroke-linecap="round" />
    </g>
  ),
};

/**
 * A folder. Its colour means exactly one thing: orange means the folder is excluded
 * from the walk (`fs.noScan`), so search and the language server do not go into it.
 * That is precisely how IDEA paints `node_modules` and `dist`, and it is a warning
 * rather than decoration.
 */
export function DirIcon({ excluded = false }: { excluded?: boolean }): JSX.Element {
  const body = excluded ? '#a8703a' : '#7f8a91';
  const flap = excluded ? '#8a5a2c' : '#6a747a';
  return (
    <svg {...ICON}>
      <path d="M1.4 4.2a1 1 0 0 1 1-1h3.1l1.5 1.8H2.4a1 1 0 0 0-1 1z" fill={flap} />
      <path
        d="M1.4 5.4a1 1 0 0 1 1-1h11.2a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H2.4a1 1 0 0 1-1-1z"
        fill={body}
      />
    </svg>
  );
}

/** The project root: the same folder, but in the module colour — so as not to get lost. */
export function RootIcon(): JSX.Element {
  return (
    <svg {...ICON}>
      <path d="M1.4 4.2a1 1 0 0 1 1-1h3.1l1.5 1.8H2.4a1 1 0 0 0-1 1z" fill="#4f6f8f" />
      <path
        d="M1.4 5.4a1 1 0 0 1 1-1h11.2a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H2.4a1 1 0 0 1-1-1z"
        fill="#6f9bc9"
      />
    </svg>
  );
}

/**
 * The disclosure chevron. Turned down means the folder is open; the turning is done by
 * CSS.
 */
export function Chevron(): JSX.Element {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
      <path
        d="M3.2 1.9 6.1 4.5 3.2 7.1"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
