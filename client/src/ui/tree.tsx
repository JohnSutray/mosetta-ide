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
import { treeFocus } from '../state/tree-ops.js';
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
  const isOpen = expanded.value.has(entry.path);
  const isCurrent = openFile.value?.path === entry.path;
  const kids = isOpen ? dirChildren.value.get(entry.path) : undefined;
  const broken = (diagnostics.value.get(entry.path) ?? []).some((d) => d.severity === 'error');
  const tint = entry.noScan ? undefined : gitTint.value.get(entry.path);

  return (
    <>
      <div
        class={`tree-row ${isCurrent ? 'is-current' : ''} ${entry.noScan ? 'is-excluded' : ''} ${
          treeFocus.value === entry.path ? 'is-focused' : ''
        }`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        onClick={() => {
          treeFocus.value = entry.path;
          if (isDir) void toggleDir(entry.path);
          else void openFileAt(entry.path);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          treeFocus.value = entry.path;
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
