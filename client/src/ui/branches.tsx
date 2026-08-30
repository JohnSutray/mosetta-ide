import { branchesWindow, git, pushWindow } from '../state/git.js';
import { useEffect, useRef } from 'preact/hooks';
import type { GitBranch } from '@ide/protocol';
import { i18n } from '../i18n/index.js';
import { Popup } from './popup.js';
import { activePick } from '../state/pick.js';
import { Chevron } from './file-icons.js';
import { Icon } from './icons.js';
import { Menu, type MenuItem } from './menu.js';

export function Branches() {
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branchesWindow.open.value) field.current?.focus();
  }, [branchesWindow.open.value]);

  useEffect(() => {
    list.current?.querySelector('.branch-row.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [branchesWindow.selected.value, git.branches.value]);

  const prompt = branchesWindow.prompt.value;
  useEffect(() => {
    if (prompt) nameField.current?.select();
  }, [prompt?.action]);

  useEffect(() => {
    if (!branchesWindow.open.value) return;
    activePick.value = {
      next: () => branchesWindow.move(1),
      prev: () => branchesWindow.move(-1),
      accept: () => branchesWindow.openMenuHere(),
      expand: () => branchesWindow.openMenuHere(),
    };
    return () => {
      activePick.value = null;
    };
  }, [branchesWindow.open.value]);

  if (!branchesWindow.open.value) return null;

  const state = git.state.value;
  const rows = branchesWindow.rows.value;

  return (
    <Popup
      id="branches"
      keys="pick"
      class="branches"
      size={{ w: 620, h: 460 }}
      min={{ w: 420, h: 260 }}
      onClose={() => (branchesWindow.open.value = false)}
      onEscape={() => branchesWindow.close()}
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.branch-menu, .branch-row')) {
          branchesWindow.menu.value = null;
        }
      }}
    >
      <div class="branches-head">
        <span class="branches-title">{i18n.t('branches.title')}</span>
        <span class="branches-meta">
          {state.branch ?? '—'}
          {state.ahead > 0 ? ` ↑${state.ahead}` : ''}
          {state.behind > 0 ? ` ↓${state.behind}` : ''}
        </span>
        <button
          class="tool is-fetch branches-fetch"
          title={i18n.t('toolbar.fetch')}
          disabled={git.running.value !== null}
          onClick={() => void branchesWindow.do('fetch')}
        >
          <Icon name="fetch" filled={false} />
        </button>
      </div>

      <div class="branches-filter">
        <input
          ref={field}
          class="field"
          placeholder={i18n.t('branches.filter')}
          value={branchesWindow.filter.value}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => branchesWindow.setFilter((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="branch-list" ref={list}>
        {rows.map((row, i) =>
          row.kind === 'branch' ? (
            <BranchRow key={row.branch.name} branch={row.branch} at={row.at} label={row.label} />
          ) : (
            <div key={`${row.kind}${i}`} class={`branch-head is-${row.kind}`}>
              {row.kind === 'head' ? i18n.t(`branches.${row.title}`) : row.title}
            </div>
          ),
        )}
        {rows.length === 0 && (
          <div class="se-empty">
            {git.branches.value.length === 0 ? i18n.t('branches.none') : i18n.t('branches.nothing')}
          </div>
        )}
      </div>

      {prompt && (
        <form
          class="branch-prompt"
          data-keys="branch-name"
          onSubmit={(e) => {
            e.preventDefault();
            void branchesWindow.do(prompt.action, prompt.value.trim());
          }}
        >
          <span class="branch-prompt-title">
            {prompt.action === 'rename' ? i18n.t('branches.newName') : i18n.t('branches.branchName')}
          </span>
          <input
            ref={nameField}
            class="field"
            value={prompt.value}
            spellcheck={false}
            autocomplete="off"
            onInput={(e) =>
              (branchesWindow.prompt.value = {
                action: prompt.action,
                value: (e.target as HTMLInputElement).value,
              })
            }
          />
          <button class="button" type="submit">
            {i18n.t('branches.apply')}
          </button>
        </form>
      )}

      <div class="branches-foot">
        <button class="button" disabled={git.running.value !== null} onClick={() => void pushWindow.show()}>
          {i18n.t('branches.push')}
        </button>
        <button class="button" onClick={() => branchesWindow.close()}>
          {i18n.t('branches.close')}
        </button>
      </div>

      <BranchActions />
    </Popup>
  );
}

function BranchRow({ branch, at, label }: { branch: GitBranch; at: number; label: string }) {
  return (
    <div
      class={`branch-row ${at === branchesWindow.selected.value ? 'is-current' : ''} ${
        branch.remote ? 'is-remote' : ''
      }`}
      title={`${branch.name}${branch.subject ? ` — ${branch.subject}` : ''}`}
      onClick={(event) => {
        branchesWindow.selected.value = at;
        branchesWindow.openMenu(branch.name, (event.currentTarget as HTMLElement).getBoundingClientRect());
      }}
      onDblClick={() => void branchesWindow.do('checkout')}
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

function BranchActions() {
  const menu = branchesWindow.menu.value;
  const branch = branchesWindow.current.value;
  if (!menu || !branch) return null;

  const items: MenuItem[] = [];
  if (!branch.current) items.push({ label: 'branches.checkout', run: () => void branchesWindow.do('checkout') });
  items.push({ label: 'branches.newFrom', run: () => branchesWindow.askName('create') });
  if (!branch.remote) {
    items.push({ label: 'branches.rename', run: () => branchesWindow.askName('rename') });
    if (branch.current) items.push({ label: 'branches.update', run: () => void branchesWindow.do('pull') });
    items.push({ label: 'branches.push', run: () => void pushWindow.show() });
  }
  if (!branch.current) items.push({ label: 'branches.merge', run: () => void branchesWindow.do('merge') });
  if (!branch.remote && !branch.current) {
    items.push({ label: 'branches.delete', danger: true, run: () => void branchesWindow.do('delete') });
    items.push({
      label: 'branches.forceDelete',
      danger: true,
      run: () => void branchesWindow.do('force-delete'),
    });
  }

  return (
    <Menu
      x={menu.x}
      y={menu.y}
      items={items}
      onClose={() => (branchesWindow.menu.value = null)}
    />
  );
}
