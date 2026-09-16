export function sectionOf<T extends object>(all: object | null | undefined, section: string, defaults: T): T {
  return overlay(defaults, (all as Record<string, unknown> | null | undefined)?.[section]);
}

export function overlay<T extends object>(defaults: T, raw: unknown): T {
  return mix(defaults as Record<string, unknown>, raw) as T;
}

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
