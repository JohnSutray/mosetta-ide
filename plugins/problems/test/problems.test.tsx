import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import LspPlugin, { type Diagnostic, type FileDiagnostics, type LspSweep } from '@mosetta/ide-plugin-lsp';
import DocPlugin from '@mosetta/ide-plugin-doc';
import Problems from '../src/client.js';

/**
 * The problems panel is a plugin, and it is tested as one.
 *
 * The diagnostics are held by a NEIGHBOUR, the language server plugin. The panel only
 * shows them — so the test puts a list into the neighbour and looks at what got drawn
 * from it, and where a click leads.
 */

const NAME = '@mosetta/ide-plugin-problems';

function problem(line: number, message: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return {
    range: { start: { line, character: 4 }, end: { line, character: 9 } },
    severity: 'error',
    message,
    ...extra,
  };
}

describe('the problems panel', () => {
  let host: FakeHost;
  let view: () => unknown;

  /**
   * What the language server "said": we put it into the neighbour rather than into the
   * contract.
   */
  function setProblems(files: FileDiagnostics[]): void {
    host.plugin(LspPlugin).lsp.diagnostics.value = new Map(files.map((f) => [f.path, f.diagnostics]));
  }

  beforeEach(async () => {
    host = new FakeHost();
    (globalThis as Record<string, unknown>)['document'] ??= {};
    host.add(DocPlugin, '@mosetta/ide-plugin-doc');
    host.add(LspPlugin, '@mosetta/ide-plugin-lsp');
    host.add(Problems, NAME);
    host.surface.docs.texts.set('a.ts', '');
    await host.start();
    view = wish().view;
  });

  /** The wish about a column: the layout reads it, if there is one. */
  function wish() {
    return host.registry.all<{
      id: string;
      title: string;
      side: string;
      open: { value: boolean };
      view: () => unknown;
      close: () => void;
      defaultWidth?: number;
      minWidth?: number;
    }>('panel')[0]!;
  }

  it('sets a panel up by the rules everyone shares', () => {
    const spec = wish();
    expect(spec.id).toBe('problems');
    expect(spec.side).toBe('right');
    expect(spec.defaultWidth!).toBeGreaterThanOrEqual(spec.minWidth!);
    expect(spec.minWidth!).toBeGreaterThan(80);
    expect(spec.title).toBe('panel.problems');
  });

  it('the toggle command is declared by the plugin while the memory is kept by the core', () => {
    expect(host.ide(NAME).remembered.has('panel.open')).toBe(true);
    expect(wish().open.value).toBe(false);
    expect(host.run('panel.problems')).toBe(true);
    expect(wish().open.value).toBe(true);
  });

  it('asks for a button apart from the panel', () => {
    const wishes = host.registry.all<{ command: string; active: { value: boolean } }>(
      'toolbar.button',
    );
    expect(wishes).toHaveLength(1);
    expect(host.registry.authors('toolbar.button')).toEqual([NAME]);
    expect(wishes[0]!.command).toBe('panel.problems');
    expect(wishes[0]!.active).toBe(wish().open);
  });

  it('brings its own icon and its own styles', () => {
    const wish = host.registry.all<{ icon: unknown }>('toolbar.button')[0]!;
    expect(typeof wish.icon).toBe('function');
    expect(host.ide(NAME).styles.join('')).toContain('.problems');
  });

  it('empty — and it says so', () => {
    expect(nodes(view()).map((n) => n.props['children'])).toContain('problems.empty');
  });

  /**
   * What the project sweep said: `sweep` goes to the neighbour too, like the
   * diagnostics.
   */
  function setSweep(sweep: Partial<LspSweep>): void {
    host.plugin(LspPlugin).lsp.statuses.value = [
      {
        server: 'ts',
        state: 'ready',
        openDocs: sweep.checked ?? 0,
        sweep: { checked: 0, total: 0, mb: null, baseMb: null, budgetMb: 3072, stopped: null, ...sweep },
      },
    ];
  }

  const said = () =>
    nodes(view()).flatMap((n) => [n.props['children']].flat()).map((one) => String(one));

  it('says that not everything was checked — loudest of all when there are no errors', () => {
    setSweep({ checked: 380, total: 2010, mb: 1600, budgetMb: 3072, stopped: 'budget' });
    const texts = said();
    expect(texts).toContain('problems.empty');
    expect(texts).toContain('problems.partial.budget(checked=380,total=2010,mb=1600,budget=3072)');
    expect(texts).toContain('lsp.memoryBudgetMb');
  });

  it('the button leads TO THE SETTING rather than merely opening the settings', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    setSweep({ checked: 380, total: 2010, mb: 3110, budgetMb: 3072, stopped: 'budget' });

    const button = nodes(view()).find((one) => one.props['class'] === 'problems-raise');
    (button!.props['onClick'] as () => void)();
    expect(asked).toEqual(['memoryBudgetMb']);
  });

  it('the budget did not stretch to the project itself — it says exactly that', () => {
    setSweep({ checked: 0, total: 2010, mb: 1800, baseMb: 1800, budgetMb: 3072, stopped: 'baseline' });
    expect(said()).toContain('problems.partial.baseline(checked=0,total=2010,mb=1800,budget=3072)');
  });

  it('memory cannot be measured — a phrase of its own too', () => {
    setSweep({ checked: 2000, total: 8400, mb: null, budgetMb: 3072, stopped: 'blind' });
    expect(said()).toContain('problems.partial.blind(checked=2000,total=8400,mb=0,budget=3072)');
  });

  it('the sweep is still running — it says it is running', () => {
    setSweep({ checked: 200, total: 2010, mb: 900, budgetMb: 3072, stopped: null });
    expect(said()).toContain('problems.sweeping(checked=200,total=2010,mb=900,budget=3072)');
  });

  it('the sweep went through whole — we stay silent', () => {
    setSweep({ checked: 8400, total: 8400, stopped: 'done' });
    expect(said().some((one) => one.startsWith('problems.partial') || one.startsWith('problems.sweeping'))).toBe(false);
  });

  it('there has been no sweep yet — we stay silent too', () => {
    host.plugin(LspPlugin).lsp.statuses.value = [{ server: 'ts', state: 'starting', openDocs: 0 }];
    expect(said().some((one) => one.startsWith('problems.partial'))).toBe(false);
  });

  /**
   * The server did not come up — the panel is obliged to say so.
   *
   * The truncation rule taught the panel to admit an INCOMPLETE sweep and left the
   * worse case unanswered: there was no sweep at all. Then there is no `sweep`, the
   * truncation line is not drawn, and what stays on screen is "no problems" — the very
   * lie the rule was written against, at full height.
   *
   * Found on Linux, where `typescript-language-server` was not installed: the panel
   * showed a clean project. The case is not rare but the FIRST one — on a fresh machine
   * there is no language server by definition.
   */
  function setState(state: 'off' | 'starting' | 'ready' | 'failed', detail?: string): void {
    host.plugin(LspPlugin).lsp.statuses.value = [
      { server: 'ts', state, openDocs: 0, ...(detail ? { detail } : {}) },
    ];
  }

  it('the server crashed — it says so instead of "no problems"', () => {
    setState('failed', 'typescript-language-server: spawn typescript-language-server ENOENT');
    const texts = said();
    expect(texts).toContain(
      'problems.down(server=ts,why=typescript-language-server: spawn typescript-language-server ENOENT)',
    );
    expect(texts).not.toContain('problems.empty');
  });

  it('the reason is named rather than hidden in the journal', () => {
    setState('failed', 'the process exited (127)');
    expect(said()).toContain('problems.down(server=ts,why=the process exited (127))');
  });

  it('the button leads to the row with the server\'s command', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    setState('failed', 'spawn ENOENT');
    const button = nodes(view()).find((one) => one.props['class'] === 'problems-raise');
    (button!.props['onClick'] as () => void)();
    expect(asked).toEqual(['servers']);
  });

  it('the server is coming up — "no problems" is premature', () => {
    setState('starting');
    const texts = said();
    expect(texts).toContain('problems.starting(server=ts)');
    expect(texts).not.toContain('problems.empty');
  });

  it('the server is off by a setting — it stays silent', () => {
    setState('off');
    const texts = said();
    expect(texts.some((one) => one.startsWith('problems.down'))).toBe(false);
    expect(texts).toContain('problems.empty');
  });

  it('the server is alive and there really are no errors — "no problems"', () => {
    setState('ready');
    expect(said()).toContain('problems.empty');
  });

  it('the server crashed but something was found — the list is shown, with the complaint above it', () => {
    setState('failed', 'spawn ENOENT');
    setProblems([{ path: 'a.ts', diagnostics: [problem(1, 'broken')] }]);
    expect(said()).toContain('problems.down(server=ts,why=spawn ENOENT)');
    expect(of(view(), 'li')).toHaveLength(1);
  });

  it('shows whole files rather than only the open one', () => {
    setProblems([
      { path: 'a.ts', diagnostics: [problem(0, 'one')] },
      { path: 'b.ts', diagnostics: [problem(1, 'two'), problem(2, 'three')] },
    ]);
    host.plugin(DocPlugin).doc.open.value = { path: 'a.ts' } as never;
    const paths = of(view(), 'span')
      .filter((n) => n.props['class'] === 'problems-path')
      .map((n) => n.props['children']);
    expect(paths).toEqual(['a.ts', 'b.ts']);
    expect(of(view(), 'li')).toHaveLength(3);
  });

  it('the open file is marked', () => {
    setProblems([
      { path: 'a.ts', diagnostics: [problem(0, 'one')] },
      { path: 'b.ts', diagnostics: [problem(0, 'two')] },
    ]);
    host.plugin(DocPlugin).doc.open.value = { path: 'b.ts' } as never;
    const marked = of(view(), 'div')
      .filter((n) => String(n.props['class']).startsWith('problems-where'))
      .map((n) => String(n.props['class']).includes('is-current'));
    expect(marked).toEqual([false, true]);
  });

  it('a click leads to the line and the column', async () => {
    setProblems([{ path: 'a.ts', diagnostics: [problem(7, 'right here')] }]);
    const row = of(view(), 'li')[0]!;
    await (row.props['onClick'] as () => Promise<void>)();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toMatchObject({ path: 'a.ts', line: 7, character: 4 });
  });

  it('a click on the path leads to the file\'s first error', async () => {
    setProblems([
      { path: 'a.ts', diagnostics: [problem(3, 'the first'), problem(9, 'the second')] },
    ]);
    const head = of(view(), 'div').find((n) =>
      String(n.props['class']).startsWith('problems-where'),
    )!;
    await (head.props['onClick'] as () => Promise<void>)();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toMatchObject({ path: 'a.ts', line: 3, character: 4 });
  });

  it('the truncation is VISIBLE as a line rather than silent', () => {
    const many = Array.from({ length: 600 }, (_, i) => problem(i, `error ${i}`));
    setProblems([{ path: 'a.ts', diagnostics: many }]);
    expect(of(view(), 'li')).toHaveLength(500);
    const more = of(view(), 'div').find((n) => n.props['class'] === 'problems-more')!;
    expect(more.props['children']).toBe('problems.more(count=100)');
  });

  it('while everything fits — not a word about truncation', () => {
    setProblems([{ path: 'a.ts', diagnostics: [problem(0, 'just one')] }]);
    expect(of(view(), 'div').filter((n) => n.props['class'] === 'problems-more')).toHaveLength(0);
  });

  it('a problem\'s kind is visible from the row\'s class', () => {
    setProblems([
      {
        path: 'a.ts',
        diagnostics: [problem(0, 'a red one'), problem(1, 'a yellow one', { severity: 'warning' })],
      },
    ]);
    expect(of(view(), 'li').map((n) => n.props['class'])).toEqual([
      'problem is-error',
      'problem is-warning',
    ]);
  });
});
