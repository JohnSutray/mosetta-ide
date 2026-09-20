import { useT } from '@mosetta/ide-api/client';
import type { JSX } from 'preact';
import type { DebugState, VarNode } from './state.js';
import type { ExceptionMode, Frame, RunInfo } from './types.js';
import { Arrow, ContinueIcon, PauseIcon, SkullIcon, StepIntoIcon, StepOutIcon, StepOverIcon, StopIcon } from './icons.js';

/**
 * What the panel needs from the plugin: actions and hints. It knows nothing of the
 * socket.
 */
export interface PanelApi {
  state: DebugState;
  /** Call a command — the same thing a key does. */
  run: (command: string) => void;
  keysFor: (command: string) => string[];
  tip: { show: (el: Element, title: string, keys: string[]) => void; hide: () => void };
  showFrame: (at: number) => void;
  expand: (node: VarNode) => void;
  /** The editor's current file is dirty, and we are standing in it. */
  dirtyHere: () => boolean;
  /** The program's output goes to a terminal: it will not be in the panel. */
  outputInTerminal: boolean;
  /** Remove a FINISHED run from the list. */
  forget: (run: string) => void;
  /** A page in the browser under the debugger — to a live run, or as a root of its own. */
  openUrl: (url: string) => void;
  setExceptions: (mode: ExceptionMode) => void;
  addWatch: (expression: string) => void;
  removeWatch: (expression: string) => void;
  /** The console: evaluate in the stopped frame. */
  evaluate: (expression: string) => void;
}

const EXCEPTION_MODES: ExceptionMode[] = ['none', 'uncaught', 'all'];

/**
 * Enter in a field submits the form. With our own hands rather than the browser's:
 * between the field and the browser stands the keys dispatcher, and a press it did not
 * recognise does not always reach the native `submit`.
 */
function submitOnEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.isComposing) return;
  event.preventDefault();
  (event.currentTarget as HTMLInputElement).form?.requestSubmit();
}

const STEPS: Array<{ command: string; icon: () => JSX.Element; kind?: string; whenPaused: boolean }> = [
  { command: 'debug.continue', icon: ContinueIcon, kind: 'is-go', whenPaused: true },
  { command: 'debug.stepOver', icon: StepOverIcon, whenPaused: true },
  { command: 'debug.stepInto', icon: StepIntoIcon, whenPaused: true },
  { command: 'debug.stepOut', icon: StepOutIcon, whenPaused: true },
  { command: 'debug.pause', icon: PauseIcon, whenPaused: false },
];

/**
 * The debug panel: the step buttons, where we are standing, the stack, the variables,
 * the output. A VIEW only: the state is held by the plugin, and the actions are called
 * as commands — the same ones the keys call, so that a button and a key do literally
 * the same thing.
 */
export function DebugPanel({ api }: { api: PanelApi }) {
  const t = useT();
  const { state } = api;
  const paused = state.paused.value;
  const live = state.live.value;
  const runs = state.runs.value;
  const stuck = state.stuck.value.length > 0;
  const current = paused ? runs.find((run) => run.id === paused.run) : live[0] ?? runs[runs.length - 1];

  const button = (command: string, icon: () => JSX.Element, enabled: boolean, kind = '') => (
    <button
      key={command}
      type="button"
      class={`debug-btn ${kind}`}
      disabled={!enabled}
      onMouseEnter={(event) => api.tip.show(event.currentTarget as Element, t(`command.${command}`), api.keysFor(command))}
      onMouseLeave={() => api.tip.hide()}
      onClick={() => {
        api.tip.hide();
        api.run(command);
      }}
    >
      {icon()}
    </button>
  );

  return (
    <div class="debug">
      <div class="debug-bar">
        {STEPS.map((step) => button(step.command, step.icon, step.whenPaused ? paused !== null : live.length > 0 && !paused, step.kind))}
        <span class="debug-bar-gap" />
        {stuck
          ? button('debug.kill', SkullIcon, true, 'is-kill')
          : button('debug.stop', StopIcon, live.length > 0, 'is-stop')}
        <span class="debug-bar-gap" />
        <select
          class="debug-exc"
          value={state.exceptions.value}
          title={t('debug.exceptions.about')}
          onChange={(event) => api.setExceptions((event.currentTarget as HTMLSelectElement).value as ExceptionMode)}
        >
          {EXCEPTION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`debug.exceptions.${mode}`)}
            </option>
          ))}
        </select>
        {current && <RunLabel run={current} paused={paused !== null} onForget={() => api.forget(current.id)} />}
      </div>
      <div class="debug-body">
        {stuck && <div class="debug-note is-warn">{t('debug.stuck')}</div>}
        {live.length === 0 && <Empty api={api} />}
        <UrlField api={api} />
        {paused && api.dirtyHere() && <div class="debug-note">{t('debug.dirty')}</div>}
        {paused && <Frames api={api} />}
        {paused && <Variables api={api} />}
        <Watches api={api} />
        {runs.length > 0 && <Output api={api} />}
      </div>
      <Console api={api} />
    </div>
  );
}

function RunLabel({ run, paused, onForget }: { run: RunInfo; paused: boolean; onForget: () => void }) {
  const t = useT();
  const state = paused && run.state !== 'ended' ? 'paused' : run.state;
  const inBrowser = run.sessions.some((one) => one.kind === 'browser' && one.state !== 'ended');
  return (
    <span class={`debug-run is-${state} ${run.error ? 'is-error' : ''}`} title={run.url ?? run.error ?? run.name}>
      <b>{run.name}</b> · {t(`debug.state.${state}`)}
      {inBrowser ? ` · ${t('debug.inBrowser')}` : ''}
      {run.error ? ` · ${run.error}` : ''}
      {run.state === 'ended' && (
        <span class="debug-run-forget" title={t('debug.forget')} onClick={onForget}>
          ×
        </span>
      )}
    </span>
  );
}

/**
 * A page under the debugger by address: to a live server as its viewer, with no server
 * as a run of its own. Usually the address arrives by itself, from the program's
 * output; the field is for when the server was started by somebody other than us.
 */
function UrlField({ api }: { api: PanelApi }) {
  const t = useT();
  const send = (input: HTMLInputElement): void => {
    api.openUrl(input.value);
    input.value = '';
  };
  return (
    <form
      class="debug-url"
      onSubmit={(event) => {
        event.preventDefault();
        const input = (event.currentTarget as HTMLFormElement).querySelector('input');
        if (input) send(input);
      }}
    >
      <input class="field debug-url-field" placeholder={t('debug.url.placeholder')} onKeyDown={submitOnEnter} />
      <button type="submit" class="debug-btn debug-url-go">
        {t('debug.url.open')}
      </button>
    </form>
  );
}

function Empty({ api }: { api: PanelApi }) {
  const t = useT();
  const keys = api.keysFor('debug.file');
  return (
    <div class="placeholder debug-empty">
      <p>{t('debug.empty.title')}</p>
      <p>{keys.length > 0 ? t('debug.empty.how', { keys: keys.join(', ') }) : t('debug.empty.noKeys')}</p>
    </div>
  );
}

function where(frame: Frame): string {
  const source = frame.source;
  if (!source) return '';
  const name = source.kind === 'project' ? source.path : source.kind === 'file' ? source.absolute : source.name;
  return `${name}:${frame.line}`;
}

function Frames({ api }: { api: PanelApi }) {
  const t = useT();
  const frames = api.state.frames.value;
  const at = api.state.frameAt.value;
  const paused = api.state.paused.value;
  return (
    <div class="debug-section">
      <div class="debug-head">
        <span>{t('debug.frames')}</span>
        {paused && <span class="debug-head-more">{t('debug.paused.reason', { reason: paused.description ?? paused.reason })}</span>}
      </div>
      {frames.length === 0 ? (
        <div class="debug-var-loading">{t('debug.frames.loading')}</div>
      ) : (
        <ul class="debug-frames">
          {frames.map((frame, index) => (
            <li
              key={frame.id}
              class={`debug-frame ${index === at ? 'is-current' : ''} ${frame.faint ? 'is-faint' : ''}`}
              title={where(frame)}
              onClick={() => api.showFrame(index)}
            >
              <span class="debug-frame-name">{frame.name}</span>
              <span class="debug-frame-where">{where(frame)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Variables({ api }: { api: PanelApi }) {
  const t = useT();
  const scopes = api.state.scopes.value;
  return (
    <div class="debug-section">
      <div class="debug-head">
        <span>{t('debug.variables')}</span>
      </div>
      {scopes.length === 0 ? (
        <div class="debug-var-loading">{t('debug.variables.loading')}</div>
      ) : (
        <ul class="debug-vars">
          {scopes.map((scope) => (
            <VarRow key={scope.ref} node={scope} depth={0} scope api={api} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VarRow({ node, depth, scope, api }: { node: VarNode; depth: number; scope?: boolean; api: PanelApi }) {
  const t = useT();
  const canOpen = node.ref > 0;
  return (
    <>
      <li
        class={`debug-var ${canOpen ? 'can-open' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={node.type ?? ''}
        onClick={() => {
          if (canOpen) api.expand(node);
        }}
      >
        <span class={`debug-var-arrow ${canOpen ? '' : 'is-leaf'}`}>
          <Arrow open={node.open} />
        </span>
        <span class={`debug-var-name ${scope ? 'is-scope' : ''}`}>{node.name}</span>
        {!scope && <span class="debug-var-eq">=</span>}
        {!scope && <span class="debug-var-value">{node.value}</span>}
      </li>
      {node.open && node.children === null && (
        <li class="debug-var-loading" style={{ paddingLeft: `${22 + depth * 14}px` }}>
          {t('debug.variables.loading')}
        </li>
      )}
      {node.open && node.children?.length === 0 && (
        <li class="debug-var-loading" style={{ paddingLeft: `${22 + depth * 14}px` }}>
          {t('debug.variables.empty')}
        </li>
      )}
      {node.open && node.children?.map((child) => <VarRow key={`${node.ref}:${child.name}`} node={child} depth={depth + 1} api={api} />)}
    </>
  );
}

/**
 * The watched expressions: a list recomputed at every stop. They live with the project
 * rather than with a run: they watch one and the same thing through a dozen restarts.
 */
function Watches({ api }: { api: PanelApi }) {
  const t = useT();
  const watches = api.state.watches.value;
  const paused = api.state.paused.value !== null;
  return (
    <div class="debug-section">
      <div class="debug-head">
        <span>{t('debug.watches')}</span>
      </div>
      <ul class="debug-vars">
        {watches.map((watch) => (
          <li key={watch.expression} class="debug-var debug-watch" title={watch.error ?? ''}>
            <span class="debug-var-name">{watch.expression}</span>
            <span class="debug-var-eq">=</span>
            <span class={`debug-var-value ${watch.error ? 'is-error' : ''}`}>
              {watch.error ? t('debug.watches.error') : paused ? (watch.value ?? '…') : t('debug.watches.idle')}
            </span>
            <button type="button" class="debug-watch-remove" title={t('debug.watches.remove')} onClick={() => api.removeWatch(watch.expression)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        class="debug-url"
        onSubmit={(event) => {
          event.preventDefault();
          const input = (event.currentTarget as HTMLFormElement).querySelector('input');
          if (!input) return;
          api.addWatch(input.value);
          input.value = '';
        }}
      >
        <input class="field debug-url-field" placeholder={t('debug.watches.add')} onKeyDown={submitOnEnter} />
        <button type="submit" class="debug-btn debug-url-go">
          +
        </button>
      </form>
    </div>
  );
}

/**
 * The console: the expression is evaluated in the stopped frame, the answer goes into
 * the output.
 */
function Console({ api }: { api: PanelApi }) {
  const t = useT();
  return (
    <form
      class="debug-console"
      onSubmit={(event) => {
        event.preventDefault();
        const input = (event.currentTarget as HTMLFormElement).querySelector('input');
        if (!input) return;
        api.evaluate(input.value);
        input.value = '';
      }}
    >
      <span class="debug-console-prompt">›</span>
      <input class="field debug-console-field" placeholder={t('debug.console.placeholder')} onKeyDown={submitOnEnter} />
    </form>
  );
}

function Output({ api }: { api: PanelApi }) {
  const t = useT();
  const lines = api.state.output.value;
  const hidden = api.state.hiddenNoise.value;
  return (
    <div class="debug-section">
      <div class="debug-head">
        <span>{t('debug.output')}</span>
        {hidden > 0 && <span class="debug-head-more">{t('debug.output.hidden', { count: hidden })}</span>}
      </div>
      {api.outputInTerminal && lines.length === 0 && <div class="debug-var-loading">{t('debug.output.inTerminal')}</div>}
      {lines.length > 0 && (
        <pre class="debug-output">
          {lines.map((line, at) => (
            <span key={at} class={`is-${line.category}`}>
              {line.text}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}
