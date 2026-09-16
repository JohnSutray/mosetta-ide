import type { JSX } from 'preact';

const MARKS: Record<string, { mark: string; color: string }> = {
  function: { mark: 'f', color: '#9876aa' },
  method: { mark: 'm', color: '#9876aa' },
  class: { mark: 'C', color: '#cc7832' },
  interface: { mark: 'I', color: '#6a8759' },
  type: { mark: 'T', color: '#4f9da6' },
  enum: { mark: 'E', color: '#bbb529' },
  'enum-member': { mark: 'e', color: '#bbb529' },
  property: { mark: 'p', color: '#6897bb' },
  variable: { mark: 'v', color: '#6897bb' },
};

const UNKNOWN = { mark: '?', color: '#6e7376' };

export function SymbolIcon({ kind }: { kind: string }): JSX.Element {
  const { mark, color } = MARKS[kind] ?? UNKNOWN;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" shape-rendering="geometricPrecision">
      <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="3" fill="none" stroke={color} stroke-width="1.2" />
      <text
        x="8"
        y="8.6"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="'SF Mono', Menlo, monospace"
        font-size="8.4"
        font-weight="700"
        fill={color}
      >
        {mark}
      </text>
    </svg>
  );
}
