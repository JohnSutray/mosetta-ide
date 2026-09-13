export function sectionOf<T extends object>(all: object | null | undefined, section: string, defaults: T): T {
  return overlay(defaults, (all as Record<string, unknown> | null | undefined)?.[section]);
}

export function overlay<T extends object>(defaults: T, raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...(defaults as Record<string, unknown>) } as T;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (!(key in defaults)) {
      out[key] = value;
      continue;
    }
    const wanted = (defaults as Record<string, unknown>)[key];
    if (Array.isArray(wanted) ? Array.isArray(value) : typeof value === typeof wanted && value !== null) {
      out[key] = value;
    }
  }
  return out as T;
}
