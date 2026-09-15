import { useT } from '@mosetta/ide-api/client';
import type { JSX } from 'preact';
import type { DebugState, VarNode } from './state.js';
import type { Frame, RunInfo } from './types.js';
import { Arrow, ContinueIcon, PauseIcon, StepIntoIcon, StepOutIcon, StepOverIcon, StopIcon } from './icons.js';

export interface PanelApi {
  state: DebugState;
  run: (command: string) => void;
  keysFor: (command: string) => string[];
  tip: { show: (el: Element, title: string, keys: string[]) => void; hide: () => void };
  showFrame: (at: number) => void;
  expand: (node: VarNode) => void;
  dirtyHere: () => boolean;
  outputInTerminal: boolean;
  canDebugFile: () => boolean;
  openUrl: (url: string) => void;
}

const STEPS: Array<{ command: string; icon: () => JSX.Element; kind?: string; whenPaused: boolean }> = [
  { command: 'debug.continue', icon: ContinueIcon, kind: 'is-go', whenPaused: true },
  { command: 'debug.stepOver', icon: StepOverIcon, whenPaused: true },
  { command: 'debug.stepInto', icon: StepIntoIcon, whenPaused: true },
  { command: 'debug.stepOut', icon: StepOutIcon, whenPaused: true },
  { command: 'debug.pause', icon: PauseIcon, whenPaused: false },
];

export function DebugPanel({ api }: { api: PanelApi }) {
  const t = useT();
  const { state } = api;
  const paused = state.paused.value;
  const live = state.live.value;
  const runs = state.runs.value;
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
        {button('debug.stop', StopIcon, live.length > 0, 'is-stop')}
        {current && <RunLabel run={current} paused={paused !== null} />}
      </div>
      <div class="debug-body">
        {runs.length === 0 && <Empty api={api} />}
        <UrlField api={api} />
        {paused && api.dirtyHere() && <div class="debug-note">{t('debug.dirty')}</div>}
        {paused && <Frames api={api} />}
        {paused && <Variables api={api} />}
        {runs.length > 0 && <Output api={api} />}
      </div>
    </div>
  );
}

function RunLabel({ run, paused }: { run: RunInfo; paused: boolean }) {
  const t = useT();
  const state = paused && run.state !== 'ended' ? 'paused' : run.state;
  const inBrowser = run.sessions.some((one) => one.kind === 'browser' && one.state !== 'ended');
  return (
    <span class={`debug-run is-${state} ${run.error ? 'is-error' : ''}`} title={run.url ?? run.error ?? run.name}>
      <b>{run.name}</b> · {t(`debug.state.${state}`)}
      {inBrowser ? ` · ${t('debug.inBrowser')}` : ''}
      {run.error ? ` · ${run.error}` : ''}
    </span>
  );
}

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
      <input class="field debug-url-field" placeholder={t('debug.url.placeholder')} />
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
      {api.canDebugFile() && (
        <button type="button" class="debug-btn" style={{ width: 'auto', padding: '0 8px' }} onClick={() => api.run('debug.file')}>
          {t('command.debug.file')}
        </button>
      )}
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
