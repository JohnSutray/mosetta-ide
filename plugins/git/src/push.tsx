import { t } from '@ide/api/client';
import type { Git, PushWindow } from './state.js';
import { useRef } from 'preact/hooks';
import type { GitCommit } from './types.js';
import { ChangedTree } from './changed-tree.js';
import { Popup, Resizer } from '@ide/ui';
import { geometry } from '@ide/windows';

const FILES_ID = 'push.files';
const FILES_DEFAULT = 460;
const FILES_MIN = 220;
const COMMITS_MIN = 300;

const MESSAGE_ID = 'push.message';
const MESSAGE_DEFAULT = 96;
const MESSAGE_MIN = 48;
const TREE_MIN = 120;

export interface PushProps {
  git: Git;
  push: PushWindow;
}

export function Push({ git, push }: PushProps) {
  const split = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLDivElement>(null);

  const limits = () => {
    const full = split.current?.getBoundingClientRect().width ?? window.innerWidth;
    return { min: FILES_MIN, max: Math.max(FILES_MIN, full - COMMITS_MIN) };
  };

  const messageLimits = () => {
    const full = files.current?.getBoundingClientRect().height ?? window.innerHeight;
    return { min: MESSAGE_MIN, max: Math.max(MESSAGE_MIN, full - TREE_MIN) };
  };

  if (!push.open.value) return null;

  const preview = push.preview.value;
  const busy = git.running.value !== null;
  const force = push.force.value;

  return (
    <Popup
      id="push"
      keys="push"
      over="branches"
      class="push"
      size={{ w: 1080, h: 560 }}
      min={{ w: 620, h: 320 }}
      onClose={() => !busy && push.close()}
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.push-commit, .push-files, .resizer')) {
          push.clear();
        }
      }}
    >
        <div class="branches-head">
          <span class="branches-title">{t('push.title')}</span>
          <span class="branches-meta">
            {preview
              ? `${preview.branch ?? '—'} → ${preview.upstream ?? t('push.newBranch')}`
              : '…'}
          </span>
        </div>

        {preview ? (
          <div class="push-split" ref={split}>
            <div class="push-body">
              <div class="push-fork">
                <Lane
                  push={push}
                  title={`${t('push.local')} · ${preview.local.length}`}
                  commits={preview.local}
                  kind="local"
                  empty={t('push.nothing')}
                />
                {preview.remote.length > 0 && (
                  <Lane
                  push={push}
                    title={`${t('push.remote')} · ${preview.remote.length}`}
                    commits={preview.remote}
                    kind={force ? 'doomed' : 'remote'}
                    empty=""
                  />
                )}
              </div>

              <Lane
                  push={push}
                title={`${t('push.common')}${
                  preview.common.length ? ` · ${preview.common.length}` : ''
                }`}
                commits={preview.common}
                kind="common"
                empty={t('push.noHistory')}
              />
            </div>

            <Resizer id={FILES_ID} side="right" limits={limits} defaultWidth={FILES_DEFAULT} />

            <div
              class="push-files"
              ref={files}
              style={{ width: `${geometry.widthOf(FILES_ID, FILES_DEFAULT)}px` }}
            >
              <div class="push-lane-title">
                {push.selected.value
                  ? t('push.commitFiles', { sha: push.selected.value })
                  : t('push.allChanges')}
                {push.changes.value.length > 0 ? ` · ${push.changes.value.length}` : ''}
              </div>
              <div class="push-files-body">
                <ChangedTree changes={push.changes.value} />
              </div>

              <Resizer
                id={MESSAGE_ID}
                side="right"
                axis="y"
                limits={messageLimits}
                defaultWidth={MESSAGE_DEFAULT}
              />
              <div
                class="push-message"
                style={{ height: `${geometry.widthOf(MESSAGE_ID, MESSAGE_DEFAULT)}px` }}
              >
                <Message push={push} />
              </div>
            </div>
          </div>
        ) : (
          <div class="se-empty">{t('push.counting')}</div>
        )}

        {git.output.value !== '' && <pre class="git-log">{git.output.value}</pre>}

        <div class="branches-foot">
          <label class={`push-force ${preview?.remote.length ? 'is-armed' : ''}`}>
            <input
              type="checkbox"
              checked={force}
              disabled={busy}
              onChange={(e) => (push.force.value = (e.target as HTMLInputElement).checked)}
            />
            {preview?.remote.length
              ? t('push.forceWarn', { count: preview.remote.length })
              : t('push.force')}
          </label>

          <span class="push-spacer" />

          <button class={`button ${busy ? 'is-running' : ''}`} disabled={busy} onClick={() => void push.send()}>
            {busy && <span class="spinner" />}
            {force ? t('push.doForce') : t('push.do')}
          </button>
          <button class="button" disabled={busy} onClick={() => push.close()}>
            {t('push.cancel')}
          </button>
        </div>
    </Popup>
  );
}

function Message({ push }: { push: PushWindow }) {
  const commit = push.commit.value;
  if (!commit) return <div class="push-empty">{t('push.pickCommit')}</div>;
  return (
    <>
      <div class="push-message-head">
        {commit.author} · {commit.date} · {commit.short}
      </div>
      <div class="push-message-text">
        {commit.subject}
        {commit.body ? `\n\n${commit.body}` : ''}
      </div>
    </>
  );
}

function Lane({
  push,
  title,
  commits,
  kind,
  empty,
}: {
  push: PushWindow;
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
          <div
            key={commit.short}
            class={`push-commit is-pickable ${
              push.selected.value === commit.short ? 'is-current' : ''
            }`}
            title={`${commit.author}, ${commit.date}`}
            onClick={() => push.select(commit.short)}
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
