import { treeMenu } from '../state/tree-menu.js';
import { editorFocus } from '../state/editor.js';
import { doc, fileTree, lsp, session } from '../state/session.js';
import { tree, treeOps } from '../state/tree-ops.js';
import { git } from '../state/git.js';
import { useEffect } from 'preact/hooks';
import type { DirEntry } from '@ide/protocol';
import { keyHost } from '../keys/host.js';
import { i18n } from '../i18n/index.js';
import { Chevron, DirIcon, FileIcon, RootIcon } from './file-icons.js';

export function Tree() {
  const ws = session.current.value;
  const children = fileTree.children.value.get('');
  const focused = tree.focus.value;

  useEffect(() => {
    if (!focused) return;
    const row = document.querySelector(`.tree-row[data-path="${cssEscape(focused)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  if (!ws || !children) return <div class="tree-empty">…</div>;
  const open = fileTree.rootExpanded.value;
  return (
    <div
      class="tree"
      data-keys="tree"
      tabIndex={-1}
      onMouseDown={(event) => event.currentTarget.focus()}
    >
      <div
        class="tree-row is-root"
        data-path=""
        onClick={() => (fileTree.rootExpanded.value = !fileTree.rootExpanded.value)}
        onContextMenu={(event) => {
          event.preventDefault();
          tree.focus.value = '';
          treeMenu.show('', true, event.clientX, event.clientY);
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
          if (raw) void treeOps.dropInto(JSON.parse(raw) as string[], '', event.altKey);
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
      {open && <Level entries={children} depth={1} />}
    </div>
  );
}

function Level({ entries, depth }: { entries: DirEntry[]; depth: number }) {
  return (
    <>
      {entries.map((entry) => (
        <Row key={entry.path} entry={entry} depth={depth} />
      ))}
    </>
  );
}

function Row({ entry, depth }: { entry: DirEntry; depth: number }) {
  const isDir = entry.kind === 'dir';
  const isOpen = fileTree.expanded.value.has(entry.path);
  const isCurrent = doc.open.value?.path === entry.path;
  const kids = isOpen ? fileTree.children.value.get(entry.path) : undefined;
  const broken = lsp.brokenPaths.value.has(entry.path);
  const tint = entry.noScan ? undefined : git.tint.value.get(entry.path);

  return (
    <>
      <div
        class={`tree-row ${isCurrent ? 'is-current' : ''} ${entry.noScan ? 'is-excluded' : ''} ${
          tree.picked.value.has(entry.path) ? 'is-picked' : ''
        } ${tree.focus.value === entry.path ? 'is-focused' : ''}`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        data-path={entry.path}
        draggable
        onDragStart={(event) => {
          const paths = tree.picked.value.has(entry.path)
            ? [...tree.picked.value]
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
          void treeOps.dropInto(JSON.parse(raw) as string[], folderFor(entry), event.altKey);
        }}
        onClick={(event) => {
          const additive = keyHost.primaryHeld(event);
          if (event.shiftKey) {
            tree.range(entry.path, tree.visibleOrder());
            return;
          }
          if (additive) {
            tree.toggle(entry.path);
            return;
          }
          tree.only(entry.path);
          if (isDir) {
            void fileTree.toggle(entry.path);
            return;
          }
          editorFocus.openWithoutFocus();
          void doc.openAt(entry.path);
        }}
        onDblClick={() => {
          if (!isDir) void doc.openAt(entry.path).then(editorFocus.focus);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!tree.picked.value.has(entry.path)) tree.only(entry.path);
          else tree.focus.value = entry.path;
          treeMenu.show(entry.path, isDir, event.clientX, event.clientY);
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
          {entry.name}
        </span>
        {entry.noScan && <span class="tree-note">{i18n.t('tree.noScan')}</span>}
      </div>
      {kids ? <Level entries={kids} depth={depth + 1} /> : null}
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
