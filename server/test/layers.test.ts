import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const MAY_TOUCH_DISK = [
  'fs/os-fs.ts',
  'fs/watcher.ts',
  'config/store.ts',
  'env/which.ts',
  'plugins/host.ts',
  'plugins/shared.ts',
];

const MAY_SPAWN = [
  'env/processes.ts',
  'term/host.ts',
];

const FORBIDDEN: Array<{ from: RegExp; importing: RegExp; why: string }> = [
  {
    from: /^fs\/ram-fs\.ts$/,
    importing: /node:fs/,
    why: 'слой памяти ходит вниз только через OsFs',
  },
  {
    from: /^fs\//,
    importing: /(\.\.\/plugins\/)/,
    why: 'зависимость строго вниз: нижний слой не знает про верхние',
  },
  {
    from: /^fs\//,
    importing: /(\.\.\/rpc\/|\.\.\/methods\/)/,
    why: 'слои не знают ни про сессии, ни про транспорт',
  },
  {
    from: /^git\//,
    importing: /(node:fs|ram-fs|os-fs|\.\.\/rpc\/|\.\.\/methods\/)/,
    why: 'git — своя ось: у него собственный источник правды (.git) и собственный процесс, наши слои он не читает',
  },
  {
    from: /^plugins\//,
    importing: /(ram-fs|os-fs|file-index|\.\.\/git\/)/,
    why: 'дом плагинов знает про машину и про сборку, а данные проекта приезжают к плагину в момент вызова (ADR-0140)',
  },
  {
    from: /^env\//,
    importing: /(ram-fs|os-fs|file-index)/,
    why: 'окружение смотрит на машину, а не на данные проекта — иначе оно станет ещё одним слоем',
  },
];

async function sources(): Promise<Array<{ rel: string; text: string }>> {
  const out: Array<{ rel: string; text: string }> = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.ts')) {
        out.push({
          rel: path.relative(SRC, full).split(path.sep).join('/'),
          text: await fs.readFile(full, 'utf8'),
        });
      }
    }
  }
  await walk(SRC);
  return out;
}

function importsOf(text: string): string[] {
  return [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
}

describe('слои не растекаются', () => {
  it('диск трогает только тот, кому положено', async () => {
    const offenders: string[] = [];
    for (const { rel, text } of await sources()) {
      if (MAY_TOUCH_DISK.includes(rel)) continue;
      const bad = importsOf(text).filter((i) => i === 'node:fs' || i === 'node:fs/promises');
      if (bad.length) offenders.push(`${rel} → ${bad.join(', ')}`);
    }
    expect(
      offenders,
      `эти файлы полезли в node:fs мимо слоя ОС:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('подпроцессы рождаются там, где положено', async () => {
    const offenders: string[] = [];
    for (const { rel, text } of await sources()) {
      if (MAY_SPAWN.includes(rel)) continue;
      const bad = importsOf(text).filter((i) => i === 'node:child_process' || i === 'node-pty');
      if (bad.length) offenders.push(`${rel} → ${bad.join(', ')}`);
    }
    expect(
      offenders,
      'эти файлы запускают процесс мимо `env/processes` — можно, но впишите ' +
        `их в MAY_SPAWN с причиной:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it.each(FORBIDDEN)('$why', async ({ from, importing, why }) => {
    const offenders: string[] = [];
    for (const { rel, text } of await sources()) {
      if (!from.test(rel)) continue;
      const bad = importsOf(text).filter((i) => importing.test(i));
      if (bad.length) offenders.push(`${rel} → ${bad.join(', ')}`);
    }
    expect(offenders, `${why}\n${offenders.join('\n')}`).toEqual([]);
  });

  it('тест видит настоящие файлы, а не пустоту', async () => {
    const files = await sources();
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.rel === 'fs/os-fs.ts')).toBe(true);
    expect(files.some((f) => f.rel === 'fs/ram-fs.ts')).toBe(true);
  });
});

describe('состояние машины', () => {
  it('тесты поднимают сервер только через helpers', async () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const guilty: string[] = [];
    for (const name of await fs.readdir(dir)) {
      if (!name.endsWith('.test.ts')) continue;
      const text = await fs.readFile(path.join(dir, name), 'utf8');
      if (/\bboot\.start\s*\(/.test(text)) guilty.push(name);
    }
    expect(guilty, 'boot.start напрямую — история поедет в дом пользователя').toEqual([]);
  });
});
