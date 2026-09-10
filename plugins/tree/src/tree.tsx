import { project, t } from '@ide/api/client';
import { primaryHeld } from '@ide/plugin-keymap';
import { openDoc, openFile } from '@ide/plugin-doc';
import { useEffect, useRef } from 'preact/hooks';
import type { DirEntry } from '@ide/api/client';
import { Chevron, DirIcon, FileIcon, RootIcon } from '@ide/ui';
import type { FileTree } from './file-tree.js';
import type { TreeMenuState } from './menu.js';
import type { TreeOps, TreeSelection } from './state.js';
import type { TreeTints } from './tints.js';
import type { TreeTypeahead } from './typeahead.js';

export interface TreeProps {
  files: FileTree;
  selection: TreeSelection;
  ops: TreeOps;
  menu: TreeMenuState;
  tints: TreeTints;
  broken: { readonly value: ReadonlySet<string> };
  typeahead: TreeTypeahead;
}

export function Tree(props: TreeProps) {
  const ws = project.value;
  const children = props.files.children.value.get('');
  const focused = props.selection.focus.value;
  const field = useRef<HTMLInputElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const wanted = props.selection.wantsKeyboard.value;
  const grabKeyboard = () => {
    const el = field.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  };

  useEffect(() => {
    grabKeyboard();
  }, [wanted]);

  useEffect(() => {
    if (!focused) return;
    const row = document.querySelector(`.tree-row[data-path="${cssEscape(focused)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  if (!ws || !children) return <div class="tree-empty">…</div>;
  const open = props.files.rootExpanded.value;
  const term = props.typeahead.term.value;
  return (
    <div
      class="tree"
      data-keys="tree"
      ref={host}
      onClick={() => {
        props.typeahead.clear();
        grabKeyboard();
      }}
    >
      <div class="tree-find">
        <div class={`tree-find-box ${term ? 'is-on' : ''} ${props.typeahead.found.value ? '' : 'is-missing'}`}>
          <span class="tree-find-icon">⌕</span>
          <input
            ref={field}
            class="tree-find-input"
            value={term}
            spellcheck={false}
            autocomplete="off"
            aria-label={t('tree.find')}
            onInput={(event) => props.typeahead.type(event.currentTarget.value)}
            onBlur={() => props.typeahead.clear()}
          />
        </div>
      </div>
      <div
        class="tree-row is-root"
        data-path=""
        onClick={() => (props.files.rootExpanded.value = !props.files.rootExpanded.value)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.selection.focus.value = '';
          props.menu.show('', true, event.clientX, event.clientY);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
          markDrop('');
        }}
        onDragLeave={() => clearDrop()}
        onDrop={(event) => {
          event.preventDefault();
          clearDrop();
          const raw = event.dataTransfer?.getData('application/x-ide-paths');
          if (raw) void props.ops.dropInto(JSON.parse(raw) as string[], '', event.altKey);
        }}
        title={ws.root}
      >
        <span class={`chevron ${open ? 'is-open' : ''}`}>
          <Chevron />
        </span>
        <span class="tree-icon">
          <RootIcon />
        </span>
        <span class="tree-name is-root">{ws.name}</span>
        <span class="tree-note">{shortenHome(ws.root)}</span>
      </div>
      {open && <Level entries={children} depth={1} {...props} />}
    </div>
  );
}

function Level({ entries, depth, ...props }: { entries: DirEntry[]; depth: number } & TreeProps) {
  return (
    <>
      {entries.map((entry) => (
        <Row key={entry.path} entry={entry} depth={depth} {...props} />
      ))}
    </>
  );
}

function Row({ entry, depth, ...props }: { entry: DirEntry; depth: number } & TreeProps) {
  const { files, selection, ops, menu, tints } = props;
  const isDir = entry.kind === 'dir';
  const isOpen = files.expanded.value.has(entry.path);
  const isCurrent = openDoc.value?.path === entry.path;
  const kids = isOpen ? files.children.value.get(entry.path) : undefined;
  const broken = props.broken.value.has(entry.path);
  const tint = entry.noScan ? undefined : tints.of(entry.path);

  return (
    <>
      <div
        class={`tree-row ${isCurrent ? 'is-current' : ''} ${entry.noScan ? 'is-excluded' : ''} ${
          selection.picked.value.has(entry.path) ? 'is-picked' : ''
        } ${selection.focus.value === entry.path ? 'is-focused' : ''}`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        data-path={entry.path}
        draggable
        onDragStart={(event) => {
          const paths = selection.picked.value.has(entry.path)
            ? [...selection.picked.value]
            : [entry.path];
          event.dataTransfer?.setData('application/x-ide-paths', JSON.stringify(paths));
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
          }
          markDrop(folderFor(entry));
        }}
        onDragLeave={() => clearDrop()}
        onDrop={(event) => {
          event.preventDefault();
          clearDrop();
          const raw = event.dataTransfer?.getData('application/x-ide-paths');
          if (!raw) return;
          void ops.dropInto(JSON.parse(raw) as string[], folderFor(entry), event.altKey);
        }}
        onClick={(event) => {
          const additive = primaryHeld(event);
          if (event.shiftKey) {
            selection.range(entry.path, selection.visibleOrder());
            return;
          }
          if (additive) {
            selection.toggle(entry.path);
            return;
          }
          selection.only(entry.path);
          if (isDir) {
            void files.toggle(entry.path);
            return;
          }
          void openFile(entry.path, { focus: false });
        }}
        onDblClick={() => {
          if (!isDir) void openFile(entry.path, { focus: true });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!selection.picked.value.has(entry.path)) selection.only(entry.path);
          else selection.focus.value = entry.path;
          menu.show(entry.path, isDir, event.clientX, event.clientY);
        }}
        title={entry.path}
      >
        <span class={`chevron ${isDir ? '' : 'is-hidden'} ${isOpen ? 'is-open' : ''}`}>
          <Chevron />
        </span>
        <span class="tree-icon">
          {isDir ? <DirIcon excluded={entry.noScan} /> : <FileIcon name={entry.name} />}
        </span>
        <span class={`tree-name ${broken ? 'is-broken' : ''} ${tint ? `git-${tint}` : ''}`}>
          {found(entry.name, props.typeahead.match(entry.name))}
        </span>
        {entry.noScan && <span class="tree-note">{t('tree.noScan')}</span>}
      </div>
      {kids ? <Level entries={kids} depth={depth + 1} {...props} /> : null}
    </>
  );
}

function folderFor(entry: DirEntry): string {
  if (entry.kind === 'dir') return entry.path;
  const at = entry.path.lastIndexOf('/');
  return at === -1 ? '' : entry.path.slice(0, at);
}

let marked: Element | null = null;

function markDrop(folder: string): void {
  const next = document.querySelector(`.tree-row[data-path="${CSS.escape(folder)}"]`);
  if (next === marked) return;
  marked?.classList.remove('is-drop');
  marked = next;
  marked?.classList.add('is-drop');
}

function clearDrop(): void {
  marked?.classList.remove('is-drop');
  marked = null;
}

function shortenHome(root: string): string {
  const unix = /^(\/Users\/[^/]+|\/home\/[^/]+)(\/.*)?$/.exec(root);
  if (unix) return `~${unix[2] ?? ''}`;
  const win = /^[A-Za-z]:\\Users\\[^\\]+(\\.*)?$/.exec(root);
  if (win) return `~${win[1] ?? ''}`;
  return root;
}

function cssEscape(path: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(path) : path.replace(/"/g, '\\"');
}

function found(name: string, at: [number, number] | null) {
  if (!at) return name;
  return (
    <>
      {name.slice(0, at[0])}
      <b>{name.slice(at[0], at[1])}</b>
      {name.slice(at[1])}
    </>
  );
}
