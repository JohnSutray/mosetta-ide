import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const MAY_TOUCH_DISK = [
  'fs/os-fs.ts',
  'fs/watcher.ts',
  'config/store.ts',
  'env/toolchain.ts',
  'env/browse.ts',
  'env/recent.ts',
  'env/shell.ts',
  'env/tools.ts',
  'env/visits.ts',
];

const FORBIDDEN: Array<{ from: RegExp; importing: RegExp; why: string }> = [
  {
    from: /^search\//,
    importing: /(node:fs|node:child_process|os-fs)/,
    why: 'производный слой обязан жить на событиях памяти, а не читать диск',
  },
  {
    from: /^fs\/ram-fs\.ts$/,
    importing: /node:fs/,
    why: 'слой памяти ходит вниз только через OsFs',
  },
  {
    from: /^lsp\//,
    importing: /(node:fs\b|os-fs)/,
    why: 'языковой сервер берёт текст из памяти, иначе диагностика будет только после сохранения',
  },
  {
    from: /^fs\//,
    importing: /(\.\.\/search\/|\.\.\/lsp\/)/,
    why: 'зависимость строго вниз: нижний слой не знает про верхние',
  },
  {
    from: /^(fs|search|lsp)\//,
    importing: /(\.\.\/rpc\/|\.\.\/methods\/)/,
    why: 'слои не знают ни про сессии, ни про транспорт',
  },
  {
    from: /^git\//,
    importing: /(node:fs|ram-fs|os-fs|\.\.\/search\/|\.\.\/lsp\/|\.\.\/rpc\/|\.\.\/methods\/)/,
    why: 'git — своя ось: у него собственный источник правды (.git) и собственный процесс, наши слои он не читает',
  },
  {
    from: /^merge\//,
    importing: /(node:fs|node:child_process|ram-fs|os-fs|\.\.\/git\/|\.\.\/search\/|\.\.\/lsp\/|\.\.\/rpc\/|\.\.\/methods\/|\.\.\/workspace\/)/,
    why: 'сеанс слияния держит тексты и телефон поставщика — знать, откуда они и куда уедут, он не имеет права (ADR-0134)',
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
    expect(files.some((f) => f.rel === 'search/search-index.ts')).toBe(true);
  });
});

describe('состояние машины', () => {
  it('тесты поднимают сервер только через helpers', async () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const guilty: string[] = [];
    for (const name of await fs.readdir(dir)) {
      if (!name.endsWith('.test.ts')) continue;
      const text = await fs.readFile(path.join(dir, name), 'utf8');
      if (/\bstartServer\s*\(/.test(text)) guilty.push(name);
    }
    expect(guilty, 'startServer напрямую — история поедет в дом пользователя').toEqual([]);
  });
});
