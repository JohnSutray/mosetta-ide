import type { JSX } from 'preact';
import { fileType } from './file-types.js';

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
  const type = fileType(name);
  const wide = type.label.length > 2;
  return (
    <svg {...ICON}>
      <path
        d="M3.6 2.2a1 1 0 0 1 1-1h4.6l3.2 3.2v8.4a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1z"
        fill={PAPER}
        stroke={PAPER_EDGE}
        stroke-width="1"
        stroke-linejoin="round"
      />
      <path d="M9.2 1.2v3.2h3.2" stroke={PAPER_EDGE} stroke-width="1" stroke-linejoin="round" />
      {type.label && (
        <>
          <rect x="0.6" y="8.1" width={wide ? 12.4 : 10.6} height="6.6" rx="1.4" fill={type.color} />
          <text
            x={wide ? 6.8 : 5.9}
            y="11.5"
            textLength={wide ? 10.4 : 7.4}
            lengthAdjust="spacingAndGlyphs"
            text-anchor="middle"
            dominant-baseline="central"
            font-family="'SF Pro Text', 'Segoe UI', Helvetica, sans-serif"
            font-size={wide ? 5.4 : 6.4}
            font-weight="700"
            fill={type.ink}
          >
            {type.label}
          </text>
        </>
      )}
    </svg>
  );
}

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
