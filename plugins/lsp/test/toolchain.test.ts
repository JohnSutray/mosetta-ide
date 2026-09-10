import { describe, expect, it } from 'vitest';
import { Toolchain } from '../src/toolchain.js';
import { LSP_DEFAULTS, type LspSettings } from '../src/settings.js';

const log = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as never;
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
  projects: { 'web-ide': { typescript: { quotePreference: 'single', importModuleSpecifierEnding: 'js' } } },
};

describe('настройки языкового сервера по слоям', () => {
  it('проект перекрывает общее, чужой проект его не видит', () => {
    expect(toolchain.preferencesFor(settings, 'typescript', '/Users/me/WebstormProjects/web-ide')).toEqual({
      quotePreference: 'single',
      includePackageJsonAutoImports: 'off',
      importModuleSpecifierEnding: 'js',
    });
    expect(toolchain.preferencesFor(settings, 'typescript', '/elsewhere/other')).toEqual({
      quotePreference: 'double',
      includePackageJsonAutoImports: 'off',
    });
    expect(toolchain.preferencesFor(LSP_DEFAULTS, 'typescript', '/x/web-ide')).toEqual({});
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
