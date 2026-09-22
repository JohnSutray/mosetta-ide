import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '@mosetta/ide-api/server';
import { Toolchain } from '../src/toolchain.js';
import { LSP_DEFAULTS, type LspSettings } from '../src/settings.js';

/** A mute journal; we substitute `warn` where we check what is said out loud. */
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

describe('the language server\'s settings, by layer', () => {
  it('they are taken from the server\'s settings, as the config merged them', () => {
    expect(toolchain.preferencesFor(settings, 'typescript')).toEqual({
      quotePreference: 'double',
      includePackageJsonAutoImports: 'off',
    });
    expect(toolchain.preferencesFor(LSP_DEFAULTS, 'typescript')).toEqual({});
  });

  it('the factory ones stay unless overridden; what was overridden wins', () => {
    const options = toolchain.optionsFor('typescript', '/no/such', log, { quotePreference: 'single' }) as {
      preferences: Record<string, unknown>;
    };
    expect(options.preferences).toMatchObject({
      includeCompletionsForModuleExports: true,
      quotePreference: 'single',
    });
    expect(toolchain.optionsFor('eslint', '/no/such', log, { quotePreference: 'single' })).toBeUndefined();
  });
});

/**
 * What the language server is launched with.
 *
 * The settings used to hold the bare name `typescript-language-server`, and it was
 * looked up in PATH — that is, it worked exactly where a human had installed the server
 * by hand. On a fresh machine there is none, and the IDE opened a project with no type
 * checking at all, while saying "No problems".
 *
 * So the server now TRAVELS WITH US (a dependency of the plugin), and an empty command
 * means "ours" — as an empty `terminal.shell` means "as the system decides".
 */
describe('what to launch the language server with', () => {
  const own = new Toolchain(fileURLToPath(new URL('../src', import.meta.url)));

  it('the factory command is EMPTY — and a real file stands behind it', () => {
    expect(LSP_DEFAULTS.servers['typescript']!.command).toBe('');
    const plan = own.launchFor('typescript', LSP_DEFAULTS.servers['typescript']!, '/no/such', log)!;
    expect(plan).not.toBeNull();
    expect(fs.existsSync(plan.args[0]!)).toBe(true);
    expect(plan.command).toBe(process.execPath);
    expect(plan.env?.['ELECTRON_RUN_AS_NODE']).toBe('1');
    expect(plan.args.slice(1)).toEqual(['--stdio']);
  });

  it('a command the user named is taken verbatim', () => {
    const plan = own.launchFor(
      'typescript',
      { enabled: true, command: '/opt/my/server', args: ['--stdio'], extensions: ['ts'] },
      '/no/such',
      log,
    )!;
    expect(plan.command).toBe('/opt/my/server');
    expect(plan.args).toEqual(['--stdio']);
    expect(plan.env).toBeUndefined();
  });

  it('the project\'s server beats the bundled one', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-tls-'));
    const cli = path.join(root, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, '// the project\'s\n');
    try {
      const plan = own.launchFor('typescript', LSP_DEFAULTS.servers['typescript']!, root, log)!;
      expect(plan.args[0]).toBe(cli);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('another server with an empty command is an unfilled row rather than a default', () => {
    const said: string[] = [];
    const loud: Logger = { ...silent(), warn: (m) => void said.push(m) };
    const plan = own.launchFor('eslint', { enabled: true, command: '', args: [], extensions: ['js'] }, '/no', loud);
    expect(plan).toBeNull();
    expect(said.join(' ')).toContain('eslint');
  });
});
