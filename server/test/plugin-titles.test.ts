import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const plugins = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../plugins');

describe('паспорта плагинов', () => {
  it('у каждого базового плагина есть @plugin({ title }) и надпись в его словаре', () => {
    const missing: string[] = [];
    for (const dir of fs.readdirSync(plugins)) {
      const file = path.join(plugins, dir, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string; ide?: { client?: string; strings?: string } };
      if (!pkg.ide?.client) continue;
      const source = fs.readFileSync(path.join(plugins, dir, pkg.ide.client), 'utf8');
      const title = /@plugin\(\{\s*title:\s*'([^']+)'\s*\}\)/.exec(source)?.[1];
      if (!title) {
        missing.push(`${pkg.name}: нет @plugin({ title })`);
        continue;
      }
      const strings = pkg.ide.strings
        ? (JSON.parse(fs.readFileSync(path.join(plugins, dir, pkg.ide.strings), 'utf8')) as Record<string, string>)
        : {};
      if (!strings[title]) missing.push(`${pkg.name}: ключа «${title}» нет в словаре`);
    }
    expect(missing).toEqual([]);
  });

  it('у каждого объявленного раздела настроек есть схема значения (ADR-0215)', () => {
    const missing: string[] = [];
    for (const dir of fs.readdirSync(plugins)) {
      const file = path.join(plugins, dir, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string; ide?: { client?: string } };
      if (!pkg.ide?.client) continue;
      const source = fs.readFileSync(path.join(plugins, dir, pkg.ide.client), 'utf8');
      for (const found of source.matchAll(/@configSection\(\{([^}]*)\}\)/g)) {
        const spec = found[1] ?? '';
        const section = /section:\s*'([^']+)'/.exec(spec)?.[1] ?? '?';
        if (!/schema:\s*\w+/.test(spec)) missing.push(`${pkg.name}: раздел «${section}» без схемы значения`);
      }
    }
    expect(missing).toEqual([]);
  });
});
