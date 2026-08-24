import { parseJsonc } from './jsonc.js';

export interface PatchResult {
  text: string;
  rewritten: boolean;
}

export function patchSetting(
  raw: string,
  section: string,
  key: string,
  value: string | boolean,
): PatchResult {
  const text = raw.trim() === '' ? '{\n}\n' : raw;
  const minimal = tryMinimal(text, section, key, value);
  if (minimal !== null && applied(minimal, section, key, value)) {
    return { text: minimal, rewritten: false };
  }
  return { text: rewrite(text, section, key, value), rewritten: true };
}

function applied(text: string, section: string, key: string, value: string | boolean): boolean {
  try {
    const parsed = parseJsonc<Record<string, Record<string, unknown>>>(text, 'settings.json');
    return parsed?.[section]?.[key] === value;
  } catch {
    return false;
  }
}

function tryMinimal(
  text: string,
  section: string,
  key: string,
  value: string | boolean,
): string | null {
  const quoted = JSON.stringify(value);
  const head = new RegExp(`("${section}"\\s*:\\s*\\{)`);
  const at = head.exec(text);
  if (!at) {
    const brace = text.indexOf('{');
    if (brace === -1) return null;
    const rest = text.slice(brace + 1);
    const tail = rest.trimStart().startsWith('}') ? '' : ',';
    const insert = `\n  "${section}": { "${key}": ${quoted} }${tail}`;
    return text.slice(0, brace + 1) + insert + rest;
  }

  const body = text.slice(at.index + at[0].length);
  const field = new RegExp(`("${key}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|true|false)`);
  const found = field.exec(body);
  if (found) {
    const prefix = found[1] ?? '';
    const old = found[2] ?? '';
    const start = at.index + at[0].length + found.index + prefix.length;
    return text.slice(0, start) + quoted + text.slice(start + old.length);
  }
  const start = at.index + at[0].length;
  const tail = body.trimStart().startsWith('}') ? '' : ',';
  return `${text.slice(0, start)} "${key}": ${quoted}${tail}${text.slice(start)}`;
}

function rewrite(text: string, section: string, key: string, value: string | boolean): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = parseJsonc<Record<string, unknown>>(text, 'settings.json') ?? {};
  } catch {
    parsed = {};
  }
  const current = parsed[section];
  const merged = typeof current === 'object' && current !== null && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};
  merged[key] = value;
  return `${JSON.stringify({ ...parsed, [section]: merged }, null, 2)}\n`;
}
