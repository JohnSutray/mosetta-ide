import { useEffect, useRef } from 'preact/hooks';
import type { GitBranch } from '@ide/protocol';
import {
  askName,
  branchFilter,
  branchMenu,
  branchPrompt,
  branchRows,
  branchSelected,
  branchesOpen,
  closeBranches,
  gitBranches,
  gitDo,
  gitRunning,
  gitState,
  moveBranch,
  openBranchMenu,
  openMenuForSelected,
  openPush,
  selectedBranch,
  setBranchFilter,
} from '../state/git.js';
import { t } from '../i18n/index.js';
import { Popup } from './popup.js';
import { activePick } from '../state/pick.js';
import { Chevron } from './file-icons.js';
import { Icon } from './icons.js';

export function Branches() {
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branchesOpen.value) field.current?.focus();
  }, [branchesOpen.value]);

  useEffect(() => {
    list.current?.querySelector('.branch-row.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [branchSelected.value, gitBranches.value]);

  const prompt = branchPrompt.value;
  useEffect(() => {
    if (prompt) nameField.current?.select();
  }, [prompt?.action]);

  useEffect(() => {
    if (!branchesOpen.value) return;
    activePick.value = {
      next: () => moveBranch(1),
      prev: () => moveBranch(-1),
      accept: () => openMenuForSelected(),
      expand: () => openMenuForSelected(),
    };
    return () => {
      activePick.value = null;
    };
  }, [branchesOpen.value]);

  if (!branchesOpen.value) return null;

  const state = gitState.value;
  const rows = branchRows.value;

  return (
    <Popup
      id="branches"
      keys="pick"
      class="branches"
      size={{ w: 620, h: 460 }}
      min={{ w: 420, h: 260 }}
      onClose={() => (branchesOpen.value = false)}
      onEscape={closeBranches}
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.branch-menu, .branch-row')) {
          branchMenu.value = null;
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
          disabled={gitRunning.value !== null}
          onClick={() => void gitDo('fetch')}
        >
          <Icon name="fetch" filled={false} />
        </button>
      </div>

      <div class="branches-filter">
        <input
          ref={field}
          class="field"
          placeholder={t('branches.filter')}
          value={branchFilter.value}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => setBranchFilter((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="branch-list" ref={list}>
        {rows.map((row, i) =>
          row.kind === 'branch' ? (
            <BranchRow key={row.branch.name} branch={row.branch} at={row.at} label={row.label} />
          ) : (
            <div key={`${row.kind}${i}`} class={`branch-head is-${row.kind}`}>
              {row.kind === 'head' ? t(`branches.${row.title}`) : row.title}
            </div>
          ),
        )}
        {rows.length === 0 && (
          <div class="se-empty">
            {gitBranches.value.length === 0 ? t('branches.none') : t('branches.nothing')}
          </div>
        )}
      </div>

      {prompt && (
        <form
          class="branch-prompt"
          data-keys="branch-name"
          onSubmit={(e) => {
            e.preventDefault();
            void gitDo(prompt.action, prompt.value.trim());
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
              (branchPrompt.value = {
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
        <button class="button" disabled={gitRunning.value !== null} onClick={() => void gitDo('pull')}>
          {t('branches.pull')}
        </button>
        <button class="button" disabled={gitRunning.value !== null} onClick={() => void openPush()}>
          {t('branches.push')}
        </button>
        <button class="button" onClick={closeBranches}>
          {t('branches.close')}
        </button>
      </div>

      <Menu />
    </Popup>
  );
}

function BranchRow({ branch, at, label }: { branch: GitBranch; at: number; label: string }) {
  return (
    <div
      class={`branch-row ${at === branchSelected.value ? 'is-current' : ''} ${
        branch.remote ? 'is-remote' : ''
      }`}
      title={`${branch.name}${branch.subject ? ` — ${branch.subject}` : ''}`}
      onClick={(event) => {
        branchSelected.value = at;
        openBranchMenu(branch.name, (event.currentTarget as HTMLElement).getBoundingClientRect());
      }}
      onDblClick={() => void gitDo('checkout')}
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

function Menu() {
  const menu = branchMenu.value;
  const branch = selectedBranch.value;
  if (!menu || !branch) return null;

  const items: Array<{ label: string; danger?: boolean; run: () => void }> = [];
  if (!branch.current) items.push({ label: 'branches.checkout', run: () => void gitDo('checkout') });
  items.push({ label: 'branches.newFrom', run: () => askName('create') });
  if (!branch.remote) {
    items.push({ label: 'branches.rename', run: () => askName('rename') });
    items.push({ label: 'branches.push', run: () => void openPush() });
  }
  if (!branch.current) items.push({ label: 'branches.merge', run: () => void gitDo('merge') });
  if (!branch.remote && !branch.current) {
    items.push({ label: 'branches.delete', danger: true, run: () => void gitDo('delete') });
    items.push({
      label: 'branches.forceDelete',
      danger: true,
      run: () => void gitDo('force-delete'),
    });
  }

  return (
    <div class="branch-menu" style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
      {items.map((item) => (
        <button
          key={item.label}
          class={`branch-action ${item.danger ? 'is-danger' : ''}`}
          onClick={() => {
            branchMenu.value = null;
            item.run();
          }}
        >
          {t(item.label)}
        </button>
      ))}
    </div>
  );
}
