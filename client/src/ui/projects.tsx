import { useEffect, useRef } from 'preact/hooks';
import type { DirSuggestion } from '@ide/protocol';
import { current, workspaces } from '../state/session.js';
import {
  acceptPath,
  chooseProject,
  hideProjects,
  loadPicker,
  pathDraft,
  projectsVisible,
  pathSelected,
  pathSuggestions,
  pickDir,
  pickerAll,
  pickerChildren,
  pickerOpen,
  PICKER_PAGE,
  showAllIn,
  pickerRoots,
  recent,
  setPathDraft,
  suggestOpen,
} from '../state/projects.js';
import { Chevron, DirIcon } from './file-icons.js';
import { Popup } from './popup.js';
import { Icon } from './icons.js';
import { t } from '../i18n/index.js';

export function Projects() {
  const input = useRef<HTMLInputElement>(null);
  const shown = projectsVisible.value;

  useEffect(() => {
    if (!shown) return;
    input.current?.focus();
    void loadPicker();
  }, [shown]);

  if (!shown) return null;

  return (
    <Popup
      id="projects"
      keys="projects"
      class="projects-popup"
      size={{ w: 720, h: 560 }}
      min={{ w: 460, h: 320 }}
      onClose={hideProjects}
    >
      <div class="branches-head">
        <span class="branches-title">{t('panel.projects')}</span>
      </div>

      <div class="projects" data-keys="projects">
        <Recent />

        <form
          class="open-form"
          onSubmit={(e) => {
            e.preventDefault();
            acceptPath();
          }}
        >
          <div class="open-row">
            <input
              ref={input}
              class="field"
              placeholder={t('projects.placeholder')}
              value={pathDraft.value}
              spellcheck={false}
              autocomplete="off"
              onInput={(e) => setPathDraft((e.target as HTMLInputElement).value)}
            />
            <button class="button" type="submit">
              {t('projects.open')}
            </button>

            {suggestOpen.value && <Suggestions />}
          </div>
        </form>

        <div class="picker">
          {pickerRoots.value.map((root) => (
            <PickerNode key={root.path} item={root} depth={0} />
          ))}
        </div>
      </div>
    </Popup>
  );
}

function Recent() {
  const list = recent.value;
  const live = workspaces.value;
  const active = current.value;
  if (list.length === 0) return null;

  return (
    <div class="recent">
      {list.map((item) => {
        const open = live.find((ws) => ws.root === item.root);
        return (
          <div
            key={item.root}
            class={`recent-row ${open && open.id === active?.id ? 'is-current' : ''}`}
            title={item.root}
            onClick={() => chooseProject(item.root, open?.id)}
          >
            <span class="recent-icon">
              <Icon name="book" filled={!!open} />
            </span>
            <span class="recent-name">{item.name}</span>
            <span class="recent-meta">{shortenHome(item.root)}</span>
          </div>
        );
      })}
    </div>
  );
}

function shortenHome(root: string): string {
  const unix = /^(\/Users\/[^/]+|\/home\/[^/]+)(\/.*)?$/.exec(root);
  if (unix) return `~${unix[2] ?? ''}`;
  return root;
}

function Suggestions() {
  const list = pathSuggestions.value;
  if (list.length === 0) return <div class="suggest is-empty">{t('projects.empty')}</div>;
  return (
    <div class="suggest">
      {list.map((item, at) => (
        <div
          key={item.path}
          class={`suggest-row ${at === pathSelected.value ? 'is-current' : ''}`}
          title={item.path}
          onClick={() => {
            pathSelected.value = at;
            acceptPath();
          }}
        >
          {item.name}
        </div>
      ))}
    </div>
  );
}

function PickerNode({ item, depth }: { item: DirSuggestion; depth: number }) {
  const isOpen = pickerOpen.value.has(item.path);
  const kids = pickerChildren.value.get(item.path);
  const shown = pickerAll.value.has(item.path) ? kids : kids?.slice(0, PICKER_PAGE);
  const hidden = (kids?.length ?? 0) - (shown?.length ?? 0);
  const picked = pathDraft.value.replace(/\/$/, '') === item.path;
  const hasKids = kids === undefined || kids.length > 0;

  return (
    <>
      <div
        class={`picker-row ${picked ? 'is-current' : ''}`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        title={item.path}
        onClick={() => pickDir(item)}
      >
        <span class={`chevron ${hasKids ? '' : 'is-hidden'} ${isOpen ? 'is-open' : ''}`}>
          <Chevron />
        </span>
        <span class="tree-icon">
          <DirIcon />
        </span>
        <span class="picker-name">{item.name}</span>
      </div>
      {isOpen &&
        shown?.map((child) => <PickerNode key={child.path} item={child} depth={depth + 1} />)}
      {isOpen && hidden > 0 && (
        <div
          class="picker-more"
          style={{ paddingLeft: `${6 + (depth + 1) * 14}px` }}
          onClick={() => showAllIn(item.path)}
        >
          {t('projects.more', { count: hidden })}
        </div>
      )}
    </>
  );
}
