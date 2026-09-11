import type { SettingValue } from '@mosetta/ide-protocol';
import { jsonc } from './jsonc.js';

export interface PatchResult {
  text: string;
  rewritten: boolean;
}

function applied(text: string, section: string, key: string, value: SettingValue): boolean {
  try {
    const parsed = jsonc.parse<Record<string, Record<string, unknown>>>(text, 'settings.json');
    return JSON.stringify(parsed?.[section]?.[key]) === JSON.stringify(value);
  } catch {
    return false;
  }
}

function tryMinimal(
  text: string,
  section: string,
  key: string,
  value: SettingValue,
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
  const field = new RegExp(
    `("${key}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|true|false|-?\\d+(?:\\.\\d+)?|\\[[^\\]]*\\])`,
  );
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

function rewrite(text: string, section: string, key: string, value: SettingValue): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = jsonc.parse<Record<string, unknown>>(text, 'settings.json') ?? {};
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

function valueAt(text: string, section: string, key: string): unknown {
  try {
    return jsonc.parse<Record<string, Record<string, unknown>>>(text, 'settings.json')?.[section]?.[key];
  } catch {
    return undefined;
  }
}

function removedCleanly(before: string, after: string, section: string, key: string): boolean {
  try {
    const a = jsonc.parse<Record<string, Record<string, unknown>>>(before, 'settings.json') ?? {};
    const b = jsonc.parse<Record<string, Record<string, unknown>>>(after, 'settings.json') ?? {};
    const expected = { ...a, [section]: { ...(a[section] ?? {}) } };
    delete expected[section]![key];
    return JSON.stringify(expected) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function cut(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd === -1 ? text.length : lineEnd);
  if (lineEnd !== -1 && /^\s*$/.test(before) && /^\s*$/.test(after)) return text.slice(0, lineStart) + text.slice(lineEnd + 1);
  if (text[start - 1] === ' ' && text[start - 2] === '{') return text.slice(0, start - 1) + text.slice(end);
  return text.slice(0, start) + text.slice(end);
}

function tryRemove(text: string, section: string, key: string): string | null {
  const head = new RegExp(`"${section}"\\s*:\\s*\\{`).exec(text);
  if (!head) return null;
  const from = head.index + head[0].length;
  const value = `(?:"(?:[^"\\\\]|\\\\.)*"|true|false|null|-?\\d+(?:\\.\\d+)?|\\[[^\\]]*\\])`;
  const body = text.slice(from);
  const before = new RegExp(`,\\s*"${key}"\\s*:\\s*${value}`).exec(body);
  if (before) return cut(text, from + before.index, from + before.index + before[0].length);
  const after = new RegExp(`"${key}"\\s*:\\s*${value}[ \\t]*,[ \\t]*`).exec(body);
  if (after) return cut(text, from + after.index, from + after.index + after[0].length);
  const alone = new RegExp(`"${key}"\\s*:\\s*${value}`).exec(body);
  if (alone) return cut(text, from + alone.index, from + alone.index + alone[0].length);
  return null;
}

function rewriteWithout(text: string, section: string, key: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = jsonc.parse<Record<string, unknown>>(text, 'settings.json') ?? {};
  } catch {
    parsed = {};
  }
  const current = parsed[section];
  if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
    const rest = { ...(current as Record<string, unknown>) };
    delete rest[key];
    parsed[section] = rest;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export class Patch {
  setting(
    raw: string,
    section: string,
    key: string,
    value: SettingValue,
  ): PatchResult {
    const text = raw.trim() === '' ? '{\n}\n' : raw;
    const minimal = tryMinimal(text, section, key, value);
    if (minimal !== null && applied(minimal, section, key, value)) {
      return { text: minimal, rewritten: false };
    }
    return { text: rewrite(text, section, key, value), rewritten: true };
  }

  unset(raw: string, section: string, key: string): PatchResult {
    if (valueAt(raw, section, key) === undefined) return { text: raw, rewritten: false };
    const minimal = tryRemove(raw, section, key);
    if (minimal !== null && removedCleanly(raw, minimal, section, key)) return { text: minimal, rewritten: false };
    return { text: rewriteWithout(raw, section, key), rewritten: true };
  }
}

export const patch = new Patch();
