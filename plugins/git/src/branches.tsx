import { useT } from '@mosetta/ide-api/client';
import type { BranchesWindow, Git, PushWindow } from './state.js';
import { useEffect, useRef } from 'preact/hooks';
import type { GitBranch } from './types.js';
import { Chevron, Icon, Menu, Popup, type MenuItem } from '@mosetta/ide-plugin-ui';
import type { Windows } from '@mosetta/ide-plugin-ui';

/**
 * What the window needs from the plugin: the state, its own window, and the push window
 * next to it.
 */
export interface BranchesProps {
  windows: Windows;
  git: Git;
  window: BranchesWindow;
  push: PushWindow;
}

export function Branches({ windows, git, window, push }: BranchesProps) {
  const t = useT();
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.open.value) field.current?.focus();
  }, [window.open.value]);

  useEffect(() => {
    list.current?.querySelector('.branch-row.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [window.selected.value, git.branches.value]);

  const prompt = window.prompt.value;
  useEffect(() => {
    if (prompt) nameField.current?.select();
  }, [prompt?.action]);

  useEffect(() => {
    if (!window.open.value) return;
    windows.activePick.value = {
      next: () => window.move(1),
      prev: () => window.move(-1),
      accept: () => window.openMenuHere(),
      expand: () => window.openMenuHere(),
    };
    return () => {
      windows.activePick.value = null;
    };
  }, [window.open.value]);

  if (!window.open.value) return null;

  const state = git.state.value;
  const rows = window.rows.value;

  return (
    <Popup windows={windows}
      id="branches"
      keys="pick"
      class="branches"
      size={{ w: 620, h: 460 }}
      min={{ w: 420, h: 260 }}
      onClose={() => (window.open.value = false)}
      onEscape={() => window.close()}
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.branch-menu, .branch-row')) {
          window.menu.value = null;
        }
      }}
    >
      <div class="branches-head">
        <span class="branches-title">{t('branches.title')}</span>
        <span class="branches-meta">
          {state.branch ?? '—'}
          {state.ahead > 0 ? ` ↑${state.ahead}` : ''}
          {state.behind > 0 ? ` ↓${state.behind}` : ''}
        </span>
        <button
          class="tool is-fetch branches-fetch"
          title={t('toolbar.fetch')}
          disabled={git.running.value !== null}
          onClick={() => void window.do('fetch')}
        >
          <Icon name="fetch" filled={false} />
        </button>
      </div>

      <div class="branches-filter">
        <input
          ref={field}
          class="field"
          placeholder={t('branches.filter')}
          value={window.filter.value}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => window.setFilter((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="branch-list" ref={list}>
        {rows.map((row, i) =>
          row.kind === 'branch' ? (
            <BranchRow key={row.branch.name} branch={row.branch} at={row.at} label={row.label} window={window} />
          ) : (
            <div key={`${row.kind}${i}`} class={`branch-head is-${row.kind}`}>
              {row.kind === 'head' ? t(`branches.${row.title}`) : row.title}
            </div>
          ),
        )}
        {rows.length === 0 && (
          <div class="se-empty">
            {git.branches.value.length === 0 ? t('branches.none') : t('branches.nothing')}
          </div>
        )}
      </div>

      {prompt && (
        <form
          class="branch-prompt"
          data-keys="branch-name"
          onSubmit={(e) => {
            e.preventDefault();
            void window.do(prompt.action, prompt.value.trim());
          }}
        >
          <span class="branch-prompt-title">
            {prompt.action === 'rename' ? t('branches.newName') : t('branches.branchName')}
          </span>
          <input
            ref={nameField}
            class="field"
            value={prompt.value}
            spellcheck={false}
            autocomplete="off"
            onInput={(e) =>
              (window.prompt.value = {
                action: prompt.action,
                value: (e.target as HTMLInputElement).value,
              })
            }
          />
          <button class="button" type="submit">
            {t('branches.apply')}
          </button>
        </form>
      )}

      <div class="branches-foot">
        <button class="button" disabled={git.running.value !== null} onClick={() => void push.show()}>
          {t('branches.push')}
        </button>
        <button class="button" onClick={() => window.close()}>
          {t('branches.close')}
        </button>
      </div>

      <BranchActions windows={windows} git={git} window={window} push={push} />
    </Popup>
  );
}

/** A branch row: the name, the behind arrows and a short sha. */
function BranchRow({
  branch,
  at,
  label,
  window,
}: {
  branch: GitBranch;
  at: number;
  label: string;
  window: BranchesWindow;
}) {
  return (
    <div
      class={`branch-row ${at === window.selected.value ? 'is-current' : ''} ${
        branch.remote ? 'is-remote' : ''
      }`}
      title={`${branch.name}${branch.subject ? ` — ${branch.subject}` : ''}`}
      onClick={(event) => {
        window.selected.value = at;
        window.openMenu(branch.name, (event.currentTarget as HTMLElement).getBoundingClientRect());
      }}
      onDblClick={() => void window.do('checkout')}
    >
      <span class="branch-mark">{branch.current ? '●' : ''}</span>
      <span class="branch-name">{label}</span>
      <span class="branch-track">
        <span class="branch-ahead">{branch.ahead > 0 ? `↑${branch.ahead}` : ''}</span>
        <span class="branch-behind">{branch.behind > 0 ? `↓${branch.behind}` : ''}</span>
      </span>
      <span class="branch-sha">{branch.head}</span>
      <span class="branch-more">
        <Chevron />
      </span>
    </div>
  );
}

/** A branch's actions — to the right of the row, as in IDEA. */
function BranchActions({ windows, git, window, push }: BranchesProps) {
  const menu = window.menu.value;
  const branch = window.current.value;
  if (!menu || !branch) return null;

  const items: MenuItem[] = [];
  if (!branch.current) items.push({ label: 'branches.checkout', run: () => void window.do('checkout') });
  items.push({ label: 'branches.newFrom', run: () => window.askName('create') });
  if (!branch.remote) {
    items.push({ label: 'branches.rename', run: () => window.askName('rename') });
    if (branch.current) items.push({ label: 'branches.update', run: () => void window.do('pull') });
    items.push({ label: 'branches.push', run: () => void push.show() });
  }
  if (!branch.current) items.push({ label: 'branches.merge', run: () => void window.do('merge') });
  if (!branch.remote && !branch.current) {
    items.push({ label: 'branches.delete', danger: true, run: () => void window.do('delete') });
    items.push({
      label: 'branches.forceDelete',
      danger: true,
      run: () => void window.do('force-delete'),
    });
  }

  return (
    <Menu windows={windows}
      x={menu.x}
      y={menu.y}
      items={items}
      onClose={() => (window.menu.value = null)}
    />
  );
}
