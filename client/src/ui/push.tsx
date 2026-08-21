import { useRef } from 'preact/hooks';
import type { GitCommit } from '@ide/protocol';
import { ChangedTree } from './changed-tree.js';
import { Resizer } from './resizer.js';
import { widthOf } from '../state/layout.js';
import {
  closePush,
  doPush,
  gitOutput,
  gitRunning,
  pushForce,
  pushChanges,
  pushOpen,
  pushPreview,
  pushSelected,
  selectCommit,
} from '../state/git.js';

const FILES_ID = 'push.files';
const FILES_DEFAULT = 460;
const FILES_MIN = 220;
const COMMITS_MIN = 300;

export function Push() {
  const split = useRef<HTMLDivElement>(null);

  const limits = () => {
    const full = split.current?.getBoundingClientRect().width ?? window.innerWidth;
    return { min: FILES_MIN, max: Math.max(FILES_MIN, full - COMMITS_MIN) };
  };

  if (!pushOpen.value) return null;

  const preview = pushPreview.value;
  const busy = gitRunning.value !== null;
  const force = pushForce.value;

  return (
    <div class="se-backdrop" onMouseDown={() => !busy && closePush()}>
      <div class="push" onMouseDown={(e) => e.stopPropagation()}>
        <div class="branches-head">
          <span class="branches-title">Push</span>
          <span class="branches-meta">
            {preview ? `${preview.branch ?? '—'} → ${preview.upstream ?? 'origin (новая ветка)'}` : '…'}
          </span>
        </div>

        {preview ? (
          <div class="push-split" ref={split}>
            <div class="push-body">
              <div class="push-fork">
                <Lane
                  title={`твои · ${preview.local.length}`}
                  commits={preview.local}
                  kind="local"
                  empty="нечего отправлять"
                  selectable
                />
                {preview.remote.length > 0 && (
                  <Lane
                    title={`в удалёнке · ${preview.remote.length}`}
                    commits={preview.remote}
                    kind={force ? 'doomed' : 'remote'}
                    empty=""
                  />
                )}
              </div>

              <Lane
                title={`общее${preview.common.length ? ` · ${preview.common.length}` : ''}`}
                commits={preview.common}
                kind="common"
                empty="истории нет"
              />
            </div>

            <Resizer id={FILES_ID} side="right" limits={limits} defaultWidth={FILES_DEFAULT} />

            <div class="push-files" style={{ width: `${widthOf(FILES_ID, FILES_DEFAULT)}px` }}>
              <div class="push-lane-title">
                {pushSelected.value ? `коммит ${pushSelected.value}` : 'все твои изменения'}
                {pushChanges.value.length > 0 ? ` · ${pushChanges.value.length}` : ''}
              </div>
              <div class="push-files-body">
                <ChangedTree changes={pushChanges.value} />
              </div>
            </div>
          </div>
        ) : (
          <div class="se-empty">Считаю…</div>
        )}

        {gitOutput.value !== '' && <pre class="git-log">{gitOutput.value}</pre>}

        <div class="branches-foot">
          <label class={`push-force ${preview?.remote.length ? 'is-armed' : ''}`}>
            <input
              type="checkbox"
              checked={force}
              disabled={busy}
              onChange={(e) => (pushForce.value = (e.target as HTMLInputElement).checked)}
            />
            Форсировать
            {preview?.remote.length ? ` — затрёт ${preview.remote.length} в удалёнке` : ''}
          </label>

          <span class="push-spacer" />

          <button class={`button ${busy ? 'is-running' : ''}`} disabled={busy} onClick={() => void doPush()}>
            {busy && <span class="spinner" />}
            {force ? 'Force push' : 'Push'}
          </button>
          <button class="button" disabled={busy} onClick={closePush}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function Lane({
  title,
  commits,
  kind,
  empty,
  selectable = false,
}: {
  title: string;
  commits: GitCommit[];
  kind: 'common' | 'remote' | 'doomed' | 'local';
  empty: string;
  selectable?: boolean;
}) {
  return (
    <div class={`push-lane is-${kind}`}>
      <div class="push-lane-title">{title}</div>
      <div class="push-lane-body">
        {commits.map((commit) => (
          <div
            key={commit.short}
            class={`push-commit ${selectable ? 'is-pickable' : ''} ${
              selectable && pushSelected.value === commit.short ? 'is-current' : ''
            }`}
            title={`${commit.author}, ${commit.date}`}
            onClick={selectable ? () => selectCommit(commit.short) : undefined}
          >
            <span class="push-sha">{commit.short}</span>
            <span class="push-subject">{commit.subject}</span>
          </div>
        ))}
        {commits.length === 0 && empty !== '' && <div class="push-empty">{empty}</div>}
      </div>
    </div>
  );
}
