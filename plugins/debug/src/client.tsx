import { activate, command, configSection, plugin, remote, stub, type Ide } from '@mosetta/ide-api/client';
import { effect, signal, type Signal } from '@preact/signals';
import type { EditorView } from '@codemirror/view';
import CodePlugin, { EDITOR_DEFAULTS } from '@mosetta/ide-plugin-code';
import DocPlugin from '@mosetta/ide-plugin-doc';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import NpmScripts from '@mosetta/ide-plugin-npm-scripts';
import TerminalPlugin from '@mosetta/ide-plugin-terminal';
import UiPlugin, { Menu } from '@mosetta/ide-plugin-ui';
import { BreakpointEditor } from './editor.js';
import { ForeignView, FOREIGN_PREFIX } from './foreign.js';
import { BugIcon, ContinueIcon } from './icons.js';
import { DebugMarks, setBreakpoints, setExecution } from './marks.js';
import { DebugPanel, type PanelApi } from './panel.js';
import { DEBUG_DEFAULTS, DEBUG_SCHEMA } from './settings.js';
import { DebugState, type Foreign, type VarNode } from './state.js';
import { STYLE } from './style.js';
import type {
  BreakpointAsk,
  ExceptionMode,
  FileBreakpoints,
  Frame,
  LaunchAsk,
  Output,
  RunInfo,
  Scope,
  Step,
  Stop,
  Variable,
} from './types.js';

export type { Breakpoint, BreakpointAsk, ExceptionMode, FileBreakpoints, Frame, RunInfo, SessionInfo, SourceRef, Variable } from './types.js';
export type { BreakpointEdit, Paused, VarNode, Watch } from './state.js';

interface HoverSpot {
  path: string;
  line: number;
  character: number;
  text: string;
}

const DEBUGGABLE = /\.(?:m?js|cjs|m?ts|cts)$/i;

const MOVE_DEBOUNCE_MS = 300;

@configSection({ section: 'debug', defaults: DEBUG_DEFAULTS, schema: DEBUG_SCHEMA })
@plugin({ title: 'plugin.debug' })
export default class DebugPlugin {
  readonly state = new DebugState();
  private readonly marks: DebugMarks;
  private view: EditorView | null = null;
  private open: Signal<boolean> | null = null;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly inTerminal = signal(false);

  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  constructor(private readonly ide: Ide) {
    this.marks = new DebugMarks({
      attached: (view) => this.attached(view),
      toggled: (view, line) => void this.toggleAt(view, line),
      moved: (view, asks) => this.moved(view, asks),
      menu: (_view, line, at) => {
        const path = this.docs.openDoc.peek()?.path;
        if (path) this.state.menu.value = { path, line, at };
      },
    });
  }

  @command('panel.debug')
  protected togglePanel(): void {
    const open = this.opened();
    open.value = !open.value;
  }

  @command('debug.file')
  protected debugFile(): void {
    const path = this.docs.openDoc.value?.path;
    if (!path || !DEBUGGABLE.test(path)) {
      this.ide.say(this.ide.t('debug.notFile'));
      return;
    }
    void this.launch({ name: path, program: path });
  }

  @command('debug.runFile')
  protected runOpenFile(): void {
    const path = this.docs.openDoc.value?.path;
    if (!path || !DEBUGGABLE.test(path)) {
      this.ide.say(this.ide.t('debug.notFile'));
      return;
    }
    void this.runInTerminal(path);
  }

  @command('debug.continue') protected goOn(): void { void this.step('continue'); }
  @command('debug.stepOver') protected stepOver(): void { void this.step('next'); }
  @command('debug.stepInto') protected stepInto(): void { void this.step('stepIn'); }
  @command('debug.stepOut') protected stepOut(): void { void this.step('stepOut'); }

  @command('debug.pause')
  protected pause(): void {
    const run = this.state.live.value[0];
    const session = run?.sessions.filter((one) => one.state === 'running').at(-1);
    if (!run || !session) return;
    void this.askStep({ run: run.id, session: session.id, thread: 0, action: 'pause' }).catch((err) => this.fail(err));
  }

  @command('debug.stop')
  protected stop(): void {
    for (const run of this.state.live.value) void this.askStop({ run: run.id }).catch((err) => this.fail(err));
  }

  @command('debug.toggleBreakpoint')
  protected toggleBreakpoint(): void {
    const view = this.view;
    if (!view) return;
    void this.toggleAt(view, view.state.doc.lineAt(view.state.selection.main.head).number);
  }

  @command('debug.edit.apply')
  protected applyEdit(): void {
    void this.applyDraft();
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const open = this.opened();

    this.ide.registry('editor.extension').add({ id: 'debug', extension: this.marks.extension() });

    this.declareTitleActions();

    for (const action of [
      { id: 'debug.run', title: 'debug.tree.run', run: (path: string) => void this.runInTerminal(path) },
      { id: 'debug.debug', title: 'debug.tree.debug', run: (path: string) => void this.launch({ name: path, program: path }) },
    ]) {
      this.ide.registry('tree.action').add({
        ...action,
        opens: (path: string, isDir: boolean) => !isDir && DEBUGGABLE.test(path),
      });
    }

    this.ide.registry('panel').add({
      id: 'debug',
      title: 'panel.debug',
      side: 'right',
      open,
      defaultWidth: 340,
      minWidth: 240,
      view: () => <DebugPanel api={this.panelApi()} />,
      close: () => {
        open.value = false;
      },
    });

    this.ide.registry('toolbar.button').add({
      id: 'debug',
      title: 'toolbar.debug',
      command: 'panel.debug',
      icon: BugIcon,
      active: open,
    });

    this.ide.registry('scripts.action').add({
      id: 'debug',
      title: 'debug.script.action',
      icon: () => BugIcon(false),
      run: (scriptId: string) => void this.debugScript(scriptId),
    });

    this.ide.registry('file.view').add({
      id: 'debug',
      opens: (path: string) => path.startsWith(FOREIGN_PREFIX),
      text: false,
      view: (file: { path: string }) => (
        <ForeignView
          key={file.path}
          path={file.path}
          foreign={this.state.foreign.get(file.path) ?? null}
          fetch={(foreign) => this.fetchForeign(foreign)}
          code={this.ide.getPlugin(CodePlugin)}
          settings={this.ide.settingsOf('editor', EDITOR_DEFAULTS).value}
        />
      ),
    });

    this.ide.registry('editor.hover').add({
      id: 'debug',
      hover: (spot: HoverSpot) => this.hover(spot),
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => this.overlays());

    this.listen();

    effect(() => {
      const paused = this.state.paused.value;
      const frame = this.state.frame.value;
      const expressions = this.state.watches.peek().map((one) => one.expression);
      if (!paused || !frame) return;
      for (const expression of expressions) void this.evaluateWatch(paused.run, paused.session, frame.id, expression);
    });

    effect(() => {
      this.ide.workspaces.current.value;
      this.state.reset();
    });

    effect(() => {
      const project = this.ide.project.value;
      if (!project) return;
      void this.attach(project.root);
    });

    effect(() => {
      const path = this.docs.openDoc.value?.path ?? null;
      const list = path ? (this.state.breakpoints.value.get(path) ?? []) : [];
      const line = this.executionLine(path);
      const view = this.view;
      if (!view) return;
      view.dispatch({ effects: [setBreakpoints.of(list), setExecution.of(line)] });
    });
  }

  @remote('breakpoints') protected askBreakpoints(): Promise<FileBreakpoints[]> { return stub(); }
  @remote('setBreakpoints') protected askSetBreakpoints(_p: { path: string; breakpoints: BreakpointAsk[] }): Promise<FileBreakpoints> { return stub(); }
  @remote('exceptions') protected askExceptions(): Promise<ExceptionMode> { return stub(); }
  @remote('setExceptions') protected askSetExceptions(_p: { mode: ExceptionMode }): Promise<ExceptionMode> { return stub(); }
  @remote('launch') protected askLaunch(_p: LaunchAsk): Promise<RunInfo> { return stub(); }
  @remote('runs') protected askRuns(): Promise<RunInfo[]> { return stub(); }
  @remote('forget') protected askForget(_p: { run: string }): Promise<RunInfo[]> { return stub(); }
  @remote('runFile') protected askRunFile(_p: { path: string }): Promise<{ name: string }> { return stub(); }
  @remote('openBrowser') protected askOpenBrowser(_p: { run: string; url: string }): Promise<RunInfo> { return stub(); }
  @remote('stop') protected askStop(_p: { run: string }): Promise<null> { return stub(); }
  @remote('step') protected askStep(_p: { run: string; session: string; thread: number; action: Step }): Promise<null> { return stub(); }
  @remote('stack') protected askStack(_p: { run: string; session: string; thread: number }): Promise<Frame[]> { return stub(); }
  @remote('scopes') protected askScopes(_p: { run: string; session: string; frame: number }): Promise<Scope[]> { return stub(); }
  @remote('variables') protected askVariables(_p: { run: string; session: string; ref: number }): Promise<Variable[]> { return stub(); }
  @remote('evaluate') protected askEvaluate(_p: { run: string; session: string; expression: string; frame?: number; context: 'hover' | 'watch' | 'repl' }): Promise<Variable> { return stub(); }
  @remote('source') protected askSource(_p: { run: string; session: string; reference: number }): Promise<{ text: string }> { return stub(); }
  @remote('readForeign') protected askForeign(_p: { absolute: string }): Promise<{ text: string }> { return stub(); }

  private declareTitleActions(): void {
    const path = () => this.docs.openDoc.value?.path ?? this.docs.viewedFile.value ?? '';
    const can = () => DEBUGGABLE.test(path());
    const add = (id: string, icon: () => unknown, title: string) =>
      this.ide.registry('panel.action').add({
        id,
        panel: 'editor',
        title,
        icon,
        keys: () => this.ide.getPlugin(KeymapPlugin).keysFor(id),
        enabled: can,
        run: () => this.ide.runCommand(id),
      });
    add('debug.runFile', ContinueIcon, 'debug.title.run');
    add('debug.file', () => BugIcon(true), 'debug.title.debug');
  }

  private async runInTerminal(path: string): Promise<void> {
    try {
      const { name } = await this.askRunFile({ path });
      const terminal = this.ide.getPlugin(TerminalPlugin);
      void terminal.show(() => terminal.open({ name }));
    } catch (err) {
      this.fail(err);
    }
  }

  private async forgetRun(id: string): Promise<void> {
    try {
      this.state.setRuns(await this.askForget({ run: id }));
    } catch (err) {
      this.fail(err);
    }
  }

  async launch(ask: LaunchAsk): Promise<void> {
    this.opened().value = true;
    try {
      const run = await this.askLaunch(ask);
      this.ide.say(this.ide.t('debug.launched', { name: run.name }));
    } catch (err) {
      this.fail(err);
    }
  }

  async openUrl(url: string): Promise<void> {
    const clean = url.trim();
    if (clean === '') return;
    const live = this.state.live.value.find((run) => !run.url && run.sessions.every((one) => one.kind === 'node'));
    try {
      if (live) {
        const info = await this.askOpenBrowser({ run: live.id, url: clean });
        this.ide.say(this.ide.t('debug.browser.opened', { url: info.url ?? clean }));
        return;
      }
      await this.launch({ name: clean, url: clean });
    } catch (err) {
      this.fail(err);
    }
  }

  async debugScript(id: string): Promise<void> {
    try {
      const plan = await this.ide.getPlugin(NpmScripts).plan(id);
      const [runtime, ...runtimeArgs] = plan.argv;
      if (!runtime) throw new Error(`script ${id}: nothing to run`);
      await this.launch({ name: plan.name, runtime, runtimeArgs, cwd: plan.cwd });
    } catch (err) {
      this.fail(err);
    }
  }

  private opened(): Signal<boolean> {
    this.open ??= this.ide.remember('panel.open', false);
    return this.open;
  }

  private fail(err: unknown): void {
    this.ide.complain(this.ide.t('debug.failed', { why: err instanceof Error ? err.message : String(err) }));
  }

  private async attach(root: string): Promise<void> {
    try {
      const [runs, files, exceptions] = await Promise.all([
        this.askRuns(),
        this.askBreakpoints(),
        this.askExceptions().catch((): ExceptionMode => 'none'),
      ]);
      this.state.setRuns(runs);
      this.state.setAllBreakpoints(files);
      const rememberedMode = this.exceptionMemory(root).value;
      this.state.exceptions.value =
        exceptions === 'none' && rememberedMode !== 'none' ? await this.askSetExceptions({ mode: rememberedMode }) : exceptions;
      this.state.watches.value = this.watchMemory(root).value.map((expression) => ({ expression, value: null }));
      const memory = this.breakpointMemory(root);
      if (files.length === 0) {
        for (const [path, remembered] of Object.entries(memory.value)) {
          const breakpoints = (remembered as Array<BreakpointAsk | number>).map((one) => (typeof one === 'number' ? { line: one } : one));
          if (breakpoints.length > 0) this.state.setBreakpoints(await this.askSetBreakpoints({ path, breakpoints }));
        }
      }
      const paused = runs.flatMap((run) => run.sessions.filter((one) => one.state === 'paused' && one.stopped).map((one) => ({ run, session: one })));
      const last = paused.at(-1);
      if (last?.session.stopped) {
        this.state.stopped({ run: last.run.id, session: last.session.id, thread: last.session.stopped.thread, reason: last.session.stopped.reason });
        await this.loadStack();
      }
    } catch {}
  }

  private listen(): void {
    this.ide.on('runs', (payload) => {
      this.state.setRuns(payload as RunInfo[]);
      this.remember();
    });
    this.ide.on('stopped', (payload) => {
      const { run, session, stop } = payload as { run: string; session: string; stop: Stop };
      this.state.stopped({ run, session, thread: stop.thread, reason: stop.reason, ...(stop.description ? { description: stop.description } : {}) });
      this.opened().value = true;
      void this.loadStack();
    });
    this.ide.on('output', (payload) => this.state.addOutput(payload as Output));
    this.ide.on('breakpoints', (payload) => {
      this.state.setBreakpoints(payload as FileBreakpoints);
      this.remember();
    });
    this.ide.on('browser', (payload) => {
      const { url } = payload as { run: string; url: string };
      this.ide.say(this.ide.t('debug.browser.opened', { url }));
    });
    this.ide.on('exceptions', (payload) => {
      this.state.exceptions.value = payload as ExceptionMode;
    });
    this.ide.on('terminal', (payload) => {
      const { name } = payload as { run: string; name: string };
      this.inTerminal.value = true;
      try {
        const terminal = this.ide.getPlugin(TerminalPlugin);
        void terminal.show(() => terminal.open({ name }));
      } catch {}
    });
  }

  private breakpointMemory(root: string): Signal<Record<string, BreakpointAsk[]>> {
    return this.ide.remember<Record<string, BreakpointAsk[]>>(`breakpoints:${root}`, {}, 'both');
  }

  private exceptionMemory(root: string): Signal<ExceptionMode> {
    return this.ide.remember<ExceptionMode>(`exceptions:${root}`, 'none', 'both');
  }

  private watchMemory(root: string): Signal<string[]> {
    return this.ide.remember<string[]>(`watches:${root}`, [], 'both');
  }

  private remember(): void {
    const root = this.ide.workspaces.current.value?.root;
    if (!root) return;
    const next: Record<string, BreakpointAsk[]> = {};
    for (const [path, list] of this.state.breakpoints.value) next[path] = list.map((one) => this.state.askAt(path, one.line)!);
    this.breakpointMemory(root).value = next;
  }

  private async write(path: string, breakpoints: BreakpointAsk[]): Promise<void> {
    try {
      this.state.setBreakpoints(await this.askSetBreakpoints({ path, breakpoints }));
      this.remember();
    } catch (err) {
      this.fail(err);
    }
  }

  openEdit(path: string, line: number, at: { x: number; y: number }): void {
    this.state.menu.value = null;
    this.state.edit.value = { path, ask: this.state.askAt(path, line) ?? { line }, at };
  }

  async applyDraft(): Promise<void> {
    const edit = this.state.edit.value;
    if (!edit) return;
    this.state.edit.value = null;
    const rest = (this.state.breakpoints.value.get(edit.path) ?? [])
      .filter((one) => one.line !== edit.ask.line)
      .map((one) => this.state.askAt(edit.path, one.line)!);
    await this.write(edit.path, [...rest, edit.ask].sort((a, b) => a.line - b.line));
  }

  async removeAt(path: string, line: number): Promise<void> {
    this.state.menu.value = null;
    this.state.edit.value = null;
    const rest = (this.state.breakpoints.value.get(path) ?? [])
      .filter((one) => one.line !== line)
      .map((one) => this.state.askAt(path, one.line)!);
    await this.write(path, rest);
  }

  async setExceptions(mode: ExceptionMode): Promise<void> {
    try {
      this.state.exceptions.value = await this.askSetExceptions({ mode });
      const root = this.ide.workspaces.current.value?.root;
      if (root) this.exceptionMemory(root).value = this.state.exceptions.value;
    } catch (err) {
      this.fail(err);
    }
  }

  addWatch(expression: string): void {
    const clean = expression.trim();
    if (clean === '' || this.state.watches.value.some((one) => one.expression === clean)) return;
    this.state.watches.value = [...this.state.watches.value, { expression: clean, value: null }];
    this.rememberWatches();
    const paused = this.state.paused.value;
    const frame = this.state.frame.value;
    if (paused && frame) void this.evaluateWatch(paused.run, paused.session, frame.id, clean);
  }

  removeWatch(expression: string): void {
    this.state.watches.value = this.state.watches.value.filter((one) => one.expression !== expression);
    this.rememberWatches();
  }

  private rememberWatches(): void {
    const root = this.ide.workspaces.current.value?.root;
    if (root) this.watchMemory(root).value = this.state.watches.value.map((one) => one.expression);
  }

  private async evaluateWatch(run: string, session: string, frame: number, expression: string): Promise<void> {
    try {
      const got = await this.askEvaluate({ run, session, expression, frame, context: 'watch' });
      this.state.setWatchValue(expression, got.value);
    } catch (err) {
      this.state.setWatchValue(expression, null, err instanceof Error ? err.message : String(err));
    }
  }

  async evaluateLine(expression: string): Promise<void> {
    const clean = expression.trim();
    const paused = this.state.paused.value;
    if (clean === '') return;
    if (!paused) {
      this.ide.say(this.ide.t('debug.console.notPaused'));
      return;
    }
    this.state.addOutput({ run: paused.run, session: paused.session, category: 'repl', text: `> ${clean}\n` });
    try {
      const got = await this.askEvaluate({ run: paused.run, session: paused.session, expression: clean, frame: this.state.frame.value?.id, context: 'repl' });
      this.state.addOutput({ run: paused.run, session: paused.session, category: 'stdout', text: `${got.value}\n` });
    } catch (err) {
      this.state.addOutput({ run: paused.run, session: paused.session, category: 'stderr', text: `${err instanceof Error ? err.message : String(err)}\n` });
    }
  }

  private overlays() {
    const windows = this.ide.getPlugin(UiPlugin).windows;
    const menu = this.state.menu.value;
    const edit = this.state.edit.value;
    if (menu) {
      const has = this.state.askAt(menu.path, menu.line) !== null;
      return (
        <Menu
          windows={windows}
          x={menu.at.x}
          y={menu.at.y}
          items={[
            { label: has ? 'debug.menu.remove' : 'debug.menu.add', run: () => void (has ? this.removeAt(menu.path, menu.line) : this.write(menu.path, [...(this.state.breakpoints.value.get(menu.path) ?? []).map((one) => this.state.askAt(menu.path, one.line)!), { line: menu.line }])) },
            { label: 'debug.menu.condition', run: () => this.openEdit(menu.path, menu.line, menu.at) },
          ]}
          onClose={() => (this.state.menu.value = null)}
        />
      );
    }
    if (!edit) return null;
    return (
      <BreakpointEditor
        windows={windows}
        edit={edit}
        onDraft={(patch) => this.state.draft(patch)}
        onApply={() => void this.applyDraft()}
        onRemove={() => void this.removeAt(edit.path, edit.ask.line)}
        onClose={() => (this.state.edit.value = null)}
      />
    );
  }

  private async step(action: Step): Promise<void> {
    const paused = this.state.paused.value;
    if (!paused) return;
    try {
      await this.askStep({ run: paused.run, session: paused.session, thread: paused.thread, action });
      this.state.resumed(paused.run, paused.session);
    } catch (err) {
      this.fail(err);
    }
  }

  private async loadStack(): Promise<void> {
    const paused = this.state.paused.value;
    if (!paused) return;
    try {
      const frames = await this.askStack({ run: paused.run, session: paused.session, thread: paused.thread });
      if (this.state.paused.value !== paused) return;
      this.state.setFrames(frames);
      await this.showFrame(0);
    } catch (err) {
      this.fail(err);
    }
  }

  private async showFrame(at: number): Promise<void> {
    const paused = this.state.paused.value;
    const frame = this.state.frames.value[at];
    if (!paused || !frame) return;
    this.state.frameAt.value = at;
    const source = frame.source;
    if (source?.kind === 'project') {
      await this.docs.goTo(source.path, frame.line - 1, Math.max(0, frame.column - 1));
    } else if (source) {
      const name = FOREIGN_PREFIX + (source.kind === 'file' ? source.absolute : source.name);
      this.state.foreign.set(name, { run: paused.run, session: paused.session, source, line: frame.line });
      await this.docs.openFile(name);
    }
    await this.loadScopes(frame);
  }

  private async loadScopes(frame: Frame): Promise<void> {
    const paused = this.state.paused.value;
    if (!paused) return;
    try {
      const scopes = await this.askScopes({ run: paused.run, session: paused.session, frame: frame.id });
      if (this.state.frame.value !== frame) return;
      this.state.setScopes(scopes);
      const first = this.state.scopes.value.find((one) => !one.expensive);
      if (first) await this.expand(first);
    } catch (err) {
      this.fail(err);
    }
  }

  private async expand(node: VarNode): Promise<void> {
    if (node.children !== null) {
      this.state.toggle(node);
      return;
    }
    const paused = this.state.paused.value;
    if (!paused) return;
    this.state.toggle(node);
    try {
      const children = await this.askVariables({ run: paused.run, session: paused.session, ref: node.ref });
      const now = find(this.state.scopes.value, node.ref);
      if (now) this.state.fill(now, children);
    } catch (err) {
      this.fail(err);
    }
  }

  private async fetchForeign(foreign: Foreign): Promise<string> {
    if (foreign.source.kind === 'adapter') {
      return (await this.askSource({ run: foreign.run, session: foreign.session, reference: foreign.source.reference })).text;
    }
    return (await this.askForeign({ absolute: foreign.source.absolute })).text;
  }

  private executionLine(path: string | null): number | null {
    const frame = this.state.frame.value;
    if (!path || !frame || !this.state.paused.value) return null;
    return frame.source?.kind === 'project' && frame.source.path === path ? frame.line : null;
  }

  private attached(view: EditorView | null): void {
    this.view = view;
    if (!view) return;
    const path = this.docs.openDoc.peek()?.path ?? null;
    const list = path ? (this.state.breakpoints.peek().get(path) ?? []) : [];
    view.dispatch({ effects: [setBreakpoints.of(list), setExecution.of(this.executionLine(path))] });
  }

  private async toggleAt(view: EditorView, line: number): Promise<void> {
    const path = this.docs.openDoc.peek()?.path;
    if (!path) return;
    const asks = this.marks.asks(view.state);
    const next = asks.some((one) => one.line === line)
      ? asks.filter((one) => one.line !== line)
      : [...asks, { line }].sort((a, b) => a.line - b.line);
    await this.write(path, next);
  }

  private moved(_view: EditorView, asks: BreakpointAsk[]): void {
    const path = this.docs.openDoc.peek()?.path;
    if (!path) return;
    if (this.moveTimer) clearTimeout(this.moveTimer);
    this.moveTimer = setTimeout(() => {
      this.moveTimer = null;
      void this.askSetBreakpoints({ path, breakpoints: asks })
        .then((file) => this.state.setBreakpoints(file))
        .catch((err) => this.fail(err));
    }, MOVE_DEBOUNCE_MS);
  }

  private async hover(spot: HoverSpot): Promise<{ code: string } | null> {
    const paused = this.state.paused.value;
    const frame = this.state.frame.value;
    if (!paused || !frame || frame.source?.kind !== 'project' || frame.source.path !== spot.path) return null;
    const expression = expressionAt(spot.text, spot.character);
    if (!expression) return null;
    try {
      const value = await this.askEvaluate({ run: paused.run, session: paused.session, expression, frame: frame.id, context: 'hover' });
      return { code: `${expression} = ${value.value}` };
    } catch {
      return null;
    }
  }

  private panelApi(): PanelApi {
    const ui = this.ide.getPlugin(UiPlugin);
    return {
      state: this.state,
      run: (id) => void this.ide.runCommand(id),
      keysFor: (id) => this.ide.getPlugin(KeymapPlugin).keysFor(id),
      tip: { show: (el, title, keys) => ui.windows.tips.show(el, title, keys), hide: () => ui.windows.tips.hide() },
      showFrame: (at) => void this.showFrame(at),
      expand: (node) => void this.expand(node),
      dirtyHere: () => {
        const frame = this.state.frame.value;
        return this.docs.dirty.value && frame?.source?.kind === 'project' && frame.source.path === this.docs.openDoc.value?.path;
      },
      outputInTerminal: this.inTerminal.value,
      forget: (id) => void this.forgetRun(id),
      openUrl: (url) => void this.openUrl(url),
      setExceptions: (mode) => void this.setExceptions(mode),
      addWatch: (expression) => this.addWatch(expression),
      removeWatch: (expression) => this.removeWatch(expression),
      evaluate: (expression) => void this.evaluateLine(expression),
    };
  }
}

function find(list: VarNode[], ref: number): VarNode | null {
  for (const node of list) {
    if (node.ref === ref) return node;
    const inside = node.children ? find(node.children, ref) : null;
    if (inside) return inside;
  }
  return null;
}

export function expressionAt(text: string, character: number): string | null {
  const isWord = (ch: string) => /[\w$]/.test(ch);
  let from = character;
  let to = character;
  while (to < text.length && isWord(text[to]!)) to += 1;
  while (from > 0 && isWord(text[from - 1]!)) from -= 1;
  if (from === to) return null;
  while (from > 1 && text[from - 1] === '.' && isWord(text[from - 2]!)) {
    from -= 1;
    while (from > 0 && isWord(text[from - 1]!)) from -= 1;
  }
  const expression = text.slice(from, to);
  return /^\d/.test(expression) ? null : expression;
}
