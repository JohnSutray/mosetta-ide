import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '@mosetta/ide-api/server';
import { Toolchain } from '../src/toolchain.js';
import { LSP_DEFAULTS, type LspSettings } from '../src/settings.js';

function silent(): Logger {
  return { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
}
const log = silent();
const toolchain = new Toolchain(process.cwd());

const settings: LspSettings = {
  ...LSP_DEFAULTS,
  servers: {
    typescript: {
      enabled: true,
      command: 'typescript-language-server',
      args: ['--stdio'],
      extensions: ['ts'],
      preferences: { quotePreference: 'double', includePackageJsonAutoImports: 'off' },
    },
  },
};

describe('настройки языкового сервера по слоям', () => {
  it('берутся из настроек сервера — теми, какими их слил конфиг', () => {
    expect(toolchain.preferencesFor(settings, 'typescript')).toEqual({
      quotePreference: 'double',
      includePackageJsonAutoImports: 'off',
    });
    expect(toolchain.preferencesFor(LSP_DEFAULTS, 'typescript')).toEqual({});
  });

  it('заводские остаются, если их не перекрыли; перекрытое — побеждает', () => {
    const options = toolchain.optionsFor('typescript', '/нет/такого', log, { quotePreference: 'single' }) as {
      preferences: Record<string, unknown>;
    };
    expect(options.preferences).toMatchObject({
      includeCompletionsForModuleExports: true,
      quotePreference: 'single',
    });
    expect(toolchain.optionsFor('eslint', '/нет/такого', log, { quotePreference: 'single' })).toBeUndefined();
  });
});

describe('чем запускать языковой сервер', () => {
  const own = new Toolchain(fileURLToPath(new URL('../src', import.meta.url)));

  it('заводская команда ПУСТА — и за ней стоит настоящий файл', () => {
    expect(LSP_DEFAULTS.servers['typescript']!.command).toBe('');
    const plan = own.launchFor('typescript', LSP_DEFAULTS.servers['typescript']!, '/нет/такого', log)!;
    expect(plan).not.toBeNull();
    expect(fs.existsSync(plan.args[0]!)).toBe(true);
    expect(plan.command).toBe(process.execPath);
    expect(plan.env?.['ELECTRON_RUN_AS_NODE']).toBe('1');
    expect(plan.args.slice(1)).toEqual(['--stdio']);
  });

  it('названную человеком команду берём дословно', () => {
    const plan = own.launchFor(
      'typescript',
      { enabled: true, command: '/opt/мой/сервер', args: ['--stdio'], extensions: ['ts'] },
      '/нет/такого',
      log,
    )!;
    expect(plan.command).toBe('/opt/мой/сервер');
    expect(plan.args).toEqual(['--stdio']);
    expect(plan.env).toBeUndefined();
  });

  it('проектный сервер сильнее привезённого', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-tls-'));
    const cli = path.join(root, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, '// проектный\n');
    try {
      const plan = own.launchFor('typescript', LSP_DEFAULTS.servers['typescript']!, root, log)!;
      expect(plan.args[0]).toBe(cli);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('чужой сервер с пустой командой — это незаполненная строка, а не умолчание', () => {
    const said: string[] = [];
    const loud: Logger = { ...silent(), warn: (m) => void said.push(m) };
    const plan = own.launchFor('eslint', { enabled: true, command: '', args: [], extensions: ['js'] }, '/нет', loud);
    expect(plan).toBeNull();
    expect(said.join(' ')).toContain('eslint');
  });
});
