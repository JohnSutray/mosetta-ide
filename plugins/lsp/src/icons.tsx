import type { JSX } from 'preact';

/**
 * A language server's icon — a plate with letters.
 *
 * The same form as the file icons in the tree: a language cannot be depicted by a
 * drawing, it is recognised by its letters. A copy of our own rather than an import
 * from the widgets plugin: there is no point depending on it for two rectangles, and
 * the form here is a convention of the build rather than data.
 *
 * A server names itself (`typescript`), so the table is small and open: an unfamiliar
 * server gets the first two letters of its name and a grey plate — which is more honest
 * than inventing a colour for it.
 */

const KNOWN: Record<string, { label: string; color: string }> = {
  typescript: { label: 'TS', color: '#3178c6' },
};

/** What to call a server with this name, and what to paint it with. */
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
