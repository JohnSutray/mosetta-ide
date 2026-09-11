import { useT } from '@mosetta/ide-api/client';
import type { GitChange } from './types.js';
import { DirIcon, FileIcon } from '@mosetta/ide-plugin-ui';

interface Node {
  name: string;
  path: string;
  dirs: Node[];
  files: GitChange[];
}

export function ChangedTree({ changes }: { changes: GitChange[] }) {
  const t = useT();
  if (changes.length === 0) {
    return <div class="push-empty">{t('push.noFiles')}</div>;
  }
  const root = build(changes);
  return (
    <div class="changed">
      {root.dirs.map((dir) => (
        <Dir key={dir.path} node={dir} depth={0} />
      ))}
      {root.files.map((file) => (
        <File key={file.path} change={file} depth={0} />
      ))}
    </div>
  );
}

function Dir({ node, depth }: { node: Node; depth: number }) {
  return (
    <>
      <div class="changed-row is-dir" style={{ paddingLeft: `${6 + depth * 14}px` }}>
        <span class="tree-icon">
          <DirIcon />
        </span>
        <span class="changed-name">{node.name}</span>
        <span class="changed-count">{count(node)}</span>
      </div>
      {node.dirs.map((dir) => (
        <Dir key={dir.path} node={dir} depth={depth + 1} />
      ))}
      {node.files.map((file) => (
        <File key={file.path} change={file} depth={depth + 1} />
      ))}
    </>
  );
}

function File({ change, depth }: { change: GitChange; depth: number }) {
  const name = change.path.slice(change.path.lastIndexOf('/') + 1);
  return (
    <div
      class={`changed-row git-${change.state}`}
      style={{ paddingLeft: `${6 + depth * 14}px` }}
      title={change.path}
    >
      <span class="tree-icon">
        <FileIcon name={name} />
      </span>
      <span class="changed-name">{name}</span>
    </div>
  );
}

function count(node: Node): number {
  return node.files.length + node.dirs.reduce((sum, dir) => sum + count(dir), 0);
}

function build(changes: GitChange[]): Node {
  const root: Node = { name: '', path: '', dirs: [], files: [] };

  for (const change of changes) {
    const parts = change.path.split('/');
    const fileName = parts.pop()!;
    let node = root;
    for (const part of parts) {
      const path = node.path === '' ? part : `${node.path}/${part}`;
      let next = node.dirs.find((dir) => dir.name === part);
      if (!next) {
        next = { name: part, path, dirs: [], files: [] };
        node.dirs.push(next);
      }
      node = next;
    }
    node.files.push({ ...change, path: change.path, state: change.state });
    void fileName;
  }

  collapse(root);
  sort(root);
  return root;
}

function collapse(node: Node): void {
  for (const dir of node.dirs) collapse(dir);
  node.dirs = node.dirs.map((dir) => {
    let merged = dir;
    while (merged.files.length === 0 && merged.dirs.length === 1) {
      const only = merged.dirs[0]!;
      merged = { ...only, name: `${merged.name}/${only.name}` };
    }
    return merged;
  });
}

function sort(node: Node): void {
  node.dirs.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
  node.files.sort((a, b) => a.path.localeCompare(b.path, 'ru', { sensitivity: 'base' }));
  for (const dir of node.dirs) sort(dir);
}
