import { useEffect, useRef } from 'preact/hooks';
import type { GitBranch } from '@ide/protocol';
import {
  askName,
  branchPrompt,
  branchSelected,
  branchesOpen,
  closeBranches,
  gitBranches,
  gitDo,
  gitState,
  selectedBranch,
} from '../state/git.js';

export function Branches() {
  const list = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    list.current?.querySelector('.branch-row.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [branchSelected.value, gitBranches.value]);

  const prompt = branchPrompt.value;
  useEffect(() => {
    if (prompt) nameField.current?.select();
  }, [prompt?.action]);

  if (!branchesOpen.value) return null;

  const branches = gitBranches.value;
  const picked = selectedBranch.value;
  const state = gitState.value;

  return (
    <div class="se-backdrop" onMouseDown={() => (branchesOpen.value = false)}>
      <div class="branches" onMouseDown={(e) => e.stopPropagation()}>
        <div class="branches-head">
          <span class="branches-title">Ветки</span>
          <span class="branches-meta">
            {state.branch ?? '—'}
            {state.ahead > 0 ? ` ↑${state.ahead}` : ''}
            {state.behind > 0 ? ` ↓${state.behind}` : ''}
          </span>
        </div>

        <div class="branches-body">
          <div class="branch-list" ref={list}>
            {branches.map((branch, at) => (
              <div
                key={branch.name}
                class={`branch-row ${at === branchSelected.value ? 'is-current' : ''} ${
                  branch.remote ? 'is-remote' : ''
                }`}
                title={branch.subject ?? branch.name}
                onClick={() => {
                  branchSelected.value = at;
                  branchPrompt.value = null;
                }}
                onDblClick={() => void gitDo('checkout')}
              >
                <span class="branch-mark">{branch.current ? '●' : ''}</span>
                <span class="branch-name">{branch.name}</span>
                <span class="branch-sha">{branch.head}</span>
              </div>
            ))}
            {branches.length === 0 && <div class="se-empty">Веток нет</div>}
          </div>

          <div class="branch-menu">
            {picked ? (
              prompt ? (
                <form
                  class="branch-prompt"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void gitDo(prompt.action, prompt.value.trim());
                  }}
                >
                  <div class="branch-menu-title">
                    {prompt.action === 'rename' ? 'Новое имя' : 'Имя новой ветки'}
                  </div>
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
                    Применить
                  </button>
                </form>
              ) : (
                <Actions branch={picked} />
              )
            ) : (
              <div class="se-empty">Выбери ветку</div>
            )}
          </div>
        </div>

        <div class="branches-foot">
          <button class="button" onClick={() => void gitDo('fetch')}>
            Fetch
          </button>
          <button class="button" onClick={() => void gitDo('pull')}>
            Pull
          </button>
          <button class="button" onClick={() => void gitDo('push')}>
            Push
          </button>
          <button class="button" onClick={closeBranches}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function Actions({ branch }: { branch: GitBranch }) {
  return (
    <>
      <div class="branch-menu-title">{branch.name}</div>
      {branch.subject && <div class="branch-menu-note">{branch.subject}</div>}

      {!branch.current && (
        <button class="branch-action" onClick={() => void gitDo('checkout')}>
          Checkout
        </button>
      )}
      <button class="branch-action" onClick={() => askName('create')}>
        Новая ветка отсюда
      </button>

      {!branch.remote && (
        <>
          <button class="branch-action" onClick={() => askName('rename')}>
            Переименовать
          </button>
          <button class="branch-action" onClick={() => void gitDo('push')}>
            Push
          </button>
        </>
      )}

      {!branch.current && (
        <button class="branch-action" onClick={() => void gitDo('merge')}>
          Влить в текущую
        </button>
      )}

      {!branch.remote && !branch.current && (
        <>
          <button class="branch-action is-danger" onClick={() => void gitDo('delete')}>
            Удалить
          </button>
          <button class="branch-action is-danger" onClick={() => void gitDo('force-delete')}>
            Удалить принудительно
          </button>
        </>
      )}
    </>
  );
}
