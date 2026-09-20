/**
 * A settings section laid over its defaults.
 *
 * The defaults belong to whoever reads the section, the human's file belongs to
 * the server. This function brings them together, and does so WITHOUT trusting
 * the file: a key absent from the defaults is left as it is (the reader is
 * entitled not to know it), and a key of the wrong type falls back to its
 * default — a broken config does not bring the editor down, it merely fails to
 * configure it.
 */
export function sectionOf<T extends object>(all: object | null | undefined, section: string, defaults: T): T {
  return overlay(defaults, (all as Record<string, unknown> | null | undefined)?.[section]);
}

/**
 * One layer over another, with the same distrust as above. A section has up to
 * three layers — factory, mine, the project's — and they are folded together in
 * turn by this very function.
 */
export function overlay<T extends object>(defaults: T, raw: unknown): T {
  return mix(defaults as Record<string, unknown>, raw) as T;
}

/**
 * A layer over a layer, DEEPLY.
 *
 * A shallow layer lied exactly where a setting is nested: a project file
 * carrying only `lsp.servers.typescript.preferences` replaced the WHOLE
 * `servers` map, taking `enabled` and `command` with it, and the project's
 * language server never came up at all. Whole-file layers had always folded
 * deeply, so one and the same file was being merged by two different rules.
 * Now there is one rule.
 *
 * Lists are replaced whole: for a search mask and for a keymap, "over" means
 * "instead of" rather than "mixed in".
 */
function mix(defaults: Record<string, unknown>, raw: unknown): Record<string, unknown> {
  if (!isPlain(raw)) return { ...defaults };
  const out: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (!(key in defaults)) {
      out[key] = value;
      continue;
    }
    const wanted = defaults[key];
    if (isPlain(wanted) && isPlain(value)) {
      out[key] = mix(wanted, value);
      continue;
    }
    if (Array.isArray(wanted) ? Array.isArray(value) : typeof value === typeof wanted && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
