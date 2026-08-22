import type { DirEntry } from '@ide/protocol';
import {
  current,
  diagnostics,
  dirChildren,
  expanded,
  openFile,
  openFileAt,
  rootExpanded,
  toggleDir,
} from '../state/session.js';
import { gitTint } from '../state/git.js';
import { openTreeMenu } from '../state/tree-menu.js';
import {
  dropInto,
  selectOnly,
  selectRange,
  toggleSelected,
  treeFocus,
  treeSelection,
} from '../state/tree-ops.js';
import { MOD_IS_META } from '../keys/host.js';
import { t } from '../i18n/index.js';
import { Chevron, DirIcon, FileIcon, RootIcon } from './file-icons.js';

export function Tree() {
  const ws = current.value;
  const children = dirChildren.value.get('');
  if (!ws || !children) return <div class="tree-empty">…</div>;
  const open = rootExpanded.value;
  return (
    <div class="tree">
      <div
        class="tree-row is-root"
        onClick={() => (rootExpanded.value = !rootExpanded.value)}
        onContextMenu={(event) => {
          event.preventDefault();
          treeFocus.value = '';
          openTreeMenu('', true, event.clientX, event.clientY);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
        }}
        onDrop={(event) => {
          event.preventDefault();
          const raw = event.dataTransfer?.getData('application/x-ide-paths');
          if (raw) void dropInto(JSON.parse(raw) as string[], '', event.altKey);
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

function visibleOrder(): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const entry of dirChildren.value.get(path) ?? []) {
      out.push(entry.path);
      if (entry.kind === 'dir' && expanded.value.has(entry.path)) walk(entry.path);
    }
  };
  walk('');
  return out;
}

function Row({ entry, depth }: { entry: DirEntry; depth: number }) {
  const isDir = entry.kind === 'dir';
  const isOpen = expanded.value.has(entry.path);
  const isCurrent = openFile.value?.path === entry.path;
  const kids = isOpen ? dirChildren.value.get(entry.path) : undefined;
  const broken = (diagnostics.value.get(entry.path) ?? []).some((d) => d.severity === 'error');
  const tint = entry.noScan ? undefined : gitTint.value.get(entry.path);

  return (
    <>
      <div
        class={`tree-row ${isCurrent ? 'is-current' : ''} ${entry.noScan ? 'is-excluded' : ''} ${
          treeSelection.value.has(entry.path) ? 'is-picked' : ''
        } ${treeFocus.value === entry.path ? 'is-focused' : ''}`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        draggable
        onDragStart={(event) => {
          const paths = treeSelection.value.has(entry.path)
            ? [...treeSelection.value]
            : [entry.path];
          event.dataTransfer?.setData('application/x-ide-paths', JSON.stringify(paths));
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragOver={(event) => {
          if (!isDir) return;
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
          }
          (event.currentTarget as HTMLElement).classList.add('is-drop');
        }}
        onDragLeave={(event) => (event.currentTarget as HTMLElement).classList.remove('is-drop')}
        onDrop={(event) => {
          (event.currentTarget as HTMLElement).classList.remove('is-drop');
          if (!isDir) return;
          event.preventDefault();
          const raw = event.dataTransfer?.getData('application/x-ide-paths');
          if (!raw) return;
          void dropInto(JSON.parse(raw) as string[], entry.path, event.altKey);
        }}
        onClick={(event) => {
          const additive = MOD_IS_META ? event.metaKey : event.ctrlKey;
          if (event.shiftKey) {
            selectRange(entry.path, visibleOrder());
            return;
          }
          if (additive) {
            toggleSelected(entry.path);
            return;
          }
          selectOnly(entry.path);
          if (isDir) void toggleDir(entry.path);
          else void openFileAt(entry.path);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!treeSelection.value.has(entry.path)) selectOnly(entry.path);
          else treeFocus.value = entry.path;
          openTreeMenu(entry.path, isDir, event.clientX, event.clientY);
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
        {entry.noScan && <span class="tree-note">{t('tree.noScan')}</span>}
      </div>
      {kids ? <Level entries={kids} depth={depth + 1} /> : null}
    </>
  );
}

function shortenHome(root: string): string {
  const unix = /^(\/Users\/[^/]+|\/home\/[^/]+)(\/.*)?$/.exec(root);
  if (unix) return `~${unix[2] ?? ''}`;
  const win = /^[A-Za-z]:\\Users\\[^\\]+(\\.*)?$/.exec(root);
  if (win) return `~${win[1] ?? ''}`;
  return root;
}
