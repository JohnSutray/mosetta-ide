import type { GitCommit } from '@ide/protocol';
import {
  closePush,
  doPush,
  gitOutput,
  gitRunning,
  pushForce,
  pushOpen,
  pushPreview,
} from '../state/git.js';

export function Push() {
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
          <div class="push-body">
            <Lane
              title={`общее${preview.common.length ? ` · ${preview.common.length}` : ''}`}
              commits={preview.common}
              kind="common"
              empty="истории нет"
            />
            {preview.remote.length > 0 && (
              <Lane
                title={`в удалёнке · ${preview.remote.length}`}
                commits={preview.remote}
                kind={force ? 'doomed' : 'remote'}
                empty=""
              />
            )}
            <Lane
              title={`твои · ${preview.local.length}`}
              commits={preview.local}
              kind="local"
              empty="нечего отправлять"
            />
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
}: {
  title: string;
  commits: GitCommit[];
  kind: 'common' | 'remote' | 'doomed' | 'local';
  empty: string;
}) {
  return (
    <div class={`push-lane is-${kind}`}>
      <div class="push-lane-title">{title}</div>
      <div class="push-lane-body">
        {commits.map((commit) => (
          <div key={commit.short} class="push-commit" title={`${commit.author}, ${commit.date}`}>
            <span class="push-sha">{commit.short}</span>
            <span class="push-subject">{commit.subject}</span>
          </div>
        ))}
        {commits.length === 0 && empty !== '' && <div class="push-empty">{empty}</div>}
      </div>
    </div>
  );
}
