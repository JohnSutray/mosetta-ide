import type { JSX } from 'preact';

const KNOWN: Record<string, { label: string; color: string }> = {
  typescript: { label: 'TS', color: '#3178c6' },
};

function badgeOf(server: string): { label: string; color: string } {
  return KNOWN[server] ?? { label: server.slice(0, 2).toUpperCase(), color: '#6b7275' };
}

export function ServerBadge({ server }: { server: string }): JSX.Element {
  const { label, color } = badgeOf(server);
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" shape-rendering="geometricPrecision">
      <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="3" fill={color} />
      <text
        x="8"
        y="8.6"
        textLength="7.6"
        lengthAdjust="spacingAndGlyphs"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="'SF Pro Text', 'Segoe UI', Helvetica, sans-serif"
        font-size="7.2"
        font-weight="700"
        fill="#ffffff"
      >
        {label}
      </text>
    </svg>
  );
}
