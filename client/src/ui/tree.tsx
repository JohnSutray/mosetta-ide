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

  return (
    <>
      <div
        class={`tree-row ${isCurrent ? 'is-current' : ''} ${entry.noScan ? 'is-excluded' : ''}`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        onClick={() => (isDir ? toggleDir(entry.path) : openFileAt(entry.path))}
        title={entry.path}
      >
        <span class={`chevron ${isDir ? '' : 'is-hidden'} ${isOpen ? 'is-open' : ''}`}>
          <Chevron />
        </span>
        <span class="tree-icon">
          {isDir ? <DirIcon excluded={entry.noScan} /> : <FileIcon name={entry.name} />}
        </span>
        <span class={`tree-name ${broken ? 'is-broken' : ''}`}>{entry.name}</span>
        {entry.noScan && <span class="tree-note">не индексируется</span>}
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
