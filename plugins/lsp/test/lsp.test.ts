import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import LspPlugin, { type Diagnostic } from '../src/client.js';

/**
 * Language servers as a plugin: what the client half promises its neighbours.
 * Diagnostics arrive as events and are asked for on attaching, the error list belongs
 * to the project rather than to the tab, changing project resets what was said, and a
 * dropped socket does not.
 */
const NAME = '@mosetta/ide-plugin-lsp';
const PROJECT = { id: 'p1', root: '/one', name: 'one' } as never;
const OTHER = { id: 'p2', root: '/two', name: 'two' } as never;

function problem(line: number, message: string): Diagnostic {
  return { range: { start: { line, character: 0 }, end: { line, character: 3 } }, severity: 'error', message };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let host: FakeHost;
let plugin: LspPlugin;
let known: Array<{ path: string; diagnostics: Diagnostic[] }>;

beforeEach(async () => {
  host = new FakeHost();
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host.add(DocPlugin, '@mosetta/ide-plugin-doc');
  plugin = host.add(LspPlugin, NAME);
  known = [{ path: 'b.ts', diagnostics: [problem(1, 'broken')] }];
  const ide = host.ide(NAME);
  ide.answers.set('status', () => [{ server: 'typescript', state: 'ready', openDocs: 0 }]);
  ide.answers.set('problems', () => known);
  ide.answers.set('diagnostics', (params) => ({ path: (params as { path: string }).path, diagnostics: [] }));
  await host.start();
});

describe('the language server at the plugin', () => {
  it('on attaching it asks for the status and the errors already found', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    expect(plugin.statuses.value.map((s) => s.state)).toEqual(['ready']);
    expect(plugin.problems.value.map((f) => f.path)).toEqual(['b.ts']);
  });

  it('an event adds to the map, and the list is alphabetical and without empties', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    host.ide(NAME).emit('diagnostics', { path: 'a.ts', diagnostics: [problem(3, 'here')] });
    host.ide(NAME).emit('diagnostics', { path: 'c.ts', diagnostics: [] });
    expect(plugin.problems.value.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    host.ide(NAME).emit('diagnostics', { path: 'b.ts', diagnostics: [] });
    expect(plugin.problems.value.map((f) => f.path)).toEqual(['a.ts']);
  });

  it('the open file sees its own, and only its own', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    expect(plugin.fileDiagnostics.value).toEqual([]);
    host.plugin(DocPlugin).doc.open.value = { path: 'b.ts', text: '', version: 1, revision: null, readOnly: false } as never;
    expect(plugin.fileDiagnostics.value.map((d) => d.message)).toEqual(['broken']);
  });

  it('changing project resets what was said, a dropped socket does not', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    expect(plugin.problems.value).toHaveLength(1);

    host.surface.project.value = null;
    expect(plugin.problems.value).toHaveLength(1);
    host.surface.project.value = PROJECT;
    await settle();

    known = [];
    host.surface.workspaceCurrent.value = OTHER;
    host.surface.project.value = OTHER;
    await settle();
    expect(plugin.problems.value).toHaveLength(0);
    expect(plugin.statuses.value.map((s) => s.state)).toEqual(['ready']);
  });
});

/**
 * The sweep indicator in the toolbar.
 *
 * The badge is a widget rather than a panel button, so we take it from the registry
 * exactly as the toolbar does and call `chip()` by hand. It is a DESCRIPTION rather
 * than markup: the icon, the words, the colour and the click — and that is precisely
 * what is checked here. How it looks is the toolbar's business, and checking its work
 * from here would mean checking somebody else's.
 */
describe('the sweep indicator', () => {
  interface Chip {
    text: unknown;
    more?: unknown;
    tip: string;
    tone?: string;
    busy?: boolean;
    onClick?: () => void;
  }

  function widget(): { id: string; side: string; chip: () => Chip[] | null } | undefined {
    return host.registry
      .all<{ id: string; side: string; chip: () => Chip[] | null }>('toolbar.widget')
      .find((one) => one.id === 'lsp-sweep');
  }

  /** The first badge — the one a human sees on the left of the group. */
  function first(): Chip {
    return widget()!.chip()![0]!;
  }

  function say(sweep: Record<string, unknown> | null): void {
    plugin.lsp.statuses.value = [
      {
        server: 'typescript',
        state: 'ready',
        openDocs: 0,
        ...(sweep ? { sweep: sweep as never } : {}),
      },
    ];
  }

  it('asks for a place on the right of the toolbar', () => {
    expect(widget()?.side).toBe('right');
  });

  it('there was no sweep — it stays silent', () => {
    say(null);
    expect(widget()!.chip()).toBeNull();
  });

  it('a setting switches it off entirely', () => {
    say({ checked: 10, total: 20, mb: 100, baseMb: 50, budgetMb: 3072, stopped: null });
    expect(widget()!.chip()).not.toBeNull();
    host.ide(NAME).settings.value = { lsp: { sweepIndicator: false } } as never;
    expect(widget()!.chip()).toBeNull();
  });

  it('the badge has a tooltip: the numbers mean nothing by themselves', () => {
    say({ checked: 10, total: 20, mb: 100, baseMb: 50, budgetMb: 3072, stopped: null });
    expect(first().tip).toContain('lsp.sweep.about');
    expect(first().busy).toBe(true);
  });

  it('over budget right now means yellow, even if the sweep went through whole', () => {
    say({ checked: 20, total: 20, mb: 3500, baseMb: 700, budgetMb: 3072, stopped: 'done' });
    expect(first().tone).toBe('warn');
  });

  it('within budget means ordinary, with no warning', () => {
    say({ checked: 20, total: 20, mb: 1900, baseMb: 700, budgetMb: 3072, stopped: 'done' });
    expect(first().tone).toBeUndefined();
  });

  it('a click leads to the budget setting rather than merely opening the settings', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    say({ checked: 10, total: 20, mb: 100, baseMb: 50, budgetMb: 3072, stopped: 'budget' });

    first().onClick!();
    expect(asked).toEqual(['memoryBudgetMb']);
  });

  /**
   * A crashed server is visible in the TOOLBAR.
   *
   * The indicator is drawn from `sweep`, and a server that never came up has no sweep
   * and never will — so there was no badge at all. Together with a silent problems
   * panel that gave an interface in which NOT ONE place said anything about the broken
   * tool: the only trace left was a line in the server's journal. Found on Linux, where
   * `typescript-language-server` was not installed.
   */
  function down(detail: string): void {
    plugin.lsp.statuses.value = [{ server: 'typescript', state: 'failed', detail, openDocs: 0 }];
  }

  it('the server crashed — there is a badge, although there was no sweep', () => {
    down('typescript-language-server: spawn typescript-language-server ENOENT');
    expect(widget()!.chip()).not.toBeNull();
    expect(first().tone).toBe('bad');
  });

  it('a click on it leads to the row with the command rather than to the budget', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    down('spawn ENOENT');
    first().onClick!();
    expect(asked).toEqual(['servers']);
  });

  it('the server is healthy and there was no sweep — it still stays silent', () => {
    plugin.lsp.statuses.value = [{ server: 'typescript', state: 'ready', openDocs: 0 }];
    expect(widget()!.chip()).toBeNull();
  });

  it('the setting puts out the crash badge too', () => {
    down('spawn ENOENT');
    host.ide(NAME).settings.value = { lsp: { sweepIndicator: false } } as never;
    expect(widget()!.chip()).toBeNull();
  });

  it('without the settings plugin a click breaks nothing', () => {
    say({ checked: 10, total: 20, mb: 100, baseMb: 50, budgetMb: 3072, stopped: 'budget' });
    expect(() => first().onClick!()).not.toThrow();
  });
});
