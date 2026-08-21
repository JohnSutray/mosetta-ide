import type { DirEntry } from '@ide/protocol';
import { dirChildren, expanded, openFile, openFileAt, toggleDir } from '../state/session.js';

export function Tree() {
  const children = dirChildren.value.get('');
  if (!children) return <div class="tree-empty">…</div>;
  return (
    <div class="tree">
      <Level entries={children} depth={0} />
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
  const isOpen = expanded.value.has(entry.path);
  const isCurrent = openFile.value?.path === entry.path;
  const kids = isOpen ? dirChildren.value.get(entry.path) : undefined;

  return (
    <>
      <div
        class={`tree-row ${isCurrent ? 'is-current' : ''}`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        onClick={() => (entry.kind === 'dir' ? toggleDir(entry.path) : openFileAt(entry.path))}
      >
        <span class={`chevron ${entry.kind === 'dir' ? '' : 'is-hidden'}`}>
          {isOpen ? '▾' : '▸'}
        </span>
        <span class={`tree-name ${entry.kind === 'dir' ? 'is-dir' : ''}`}>{entry.name}</span>
      </div>
      {kids ? <Level entries={kids} depth={depth + 1} /> : null}
    </>
  );
}
