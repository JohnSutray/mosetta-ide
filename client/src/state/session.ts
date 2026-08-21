import { batch, computed, signal } from '@preact/signals';
import type { DirEntry, FileText, LogLine, WorkspaceInfo } from '@ide/protocol';
import { RpcClient, RpcFailure } from '../rpc/client.js';

export const rpc = new RpcClient();

export const workspaces = signal<WorkspaceInfo[]>([]);
export const current = signal<WorkspaceInfo | null>(null);
export const logs = signal<LogLine[]>([]);
export const connected = rpc.connected;

export const dirChildren = signal<Map<string, DirEntry[]>>(new Map());
export const expanded = signal<Set<string>>(new Set());
export const openFile = signal<FileText | null>(null);
export const dirty = signal(false);
export const error = signal<string | null>(null);

export const title = computed(() => {
  const ws = current.value;
  const file = openFile.value;
  if (!ws) return 'new-ide';
  return file ? `${file.path} — ${ws.name}` : ws.name;
});

function resetProjectScope() {
  batch(() => {
    dirChildren.value = new Map();
    expanded.value = new Set();
    openFile.value = null;
    dirty.value = false;
    error.value = null;
  });
}

export async function openProject(root: string) {
  try {
    const info = await rpc.call('workspace.open', { root });
    resetProjectScope();
    current.value = info;
    await loadDir('');
  } catch (err) {
    error.value = describe(err);
  }
}

export async function switchProject(id: string) {
  if (current.value?.id === id) return;
  try {
    const info = await rpc.call('workspace.attach', { id });
    resetProjectScope();
    current.value = info;
    await loadDir('');
  } catch (err) {
    error.value = describe(err);
  }
}

export async function loadDir(path: string) {
  const entries = await rpc.call('fs.list', { path });
  const next = new Map(dirChildren.value);
  next.set(path, entries);
  dirChildren.value = next;
}

export async function toggleDir(path: string) {
  const next = new Set(expanded.value);
  if (next.has(path)) {
    next.delete(path);
    expanded.value = next;
    return;
  }
  next.add(path);
  expanded.value = next;
  if (!dirChildren.value.has(path)) {
    try {
      await loadDir(path);
    } catch (err) {
      error.value = describe(err);
    }
  }
}

export async function openFileAt(path: string) {
  try {
    const file = await rpc.call('fs.read', { path });
    batch(() => {
      openFile.value = file;
      dirty.value = false;
      error.value = null;
    });
  } catch (err) {
    error.value = describe(err);
  }
}

export async function saveFile(text: string) {
  const file = openFile.value;
  if (!file) return;
  try {
    const result = await rpc.call('fs.write', {
      path: file.path,
      text,
      expectedRevision: file.revision,
    });
    batch(() => {
      openFile.value = { ...file, text, revision: result.revision };
      dirty.value = false;
      error.value = null;
    });
  } catch (err) {
    error.value = describe(err);
  }
}

function describe(err: unknown): string {
  if (err instanceof RpcFailure) return err.message;
  return err instanceof Error ? err.message : String(err);
}

rpc.on('workspace.list', (list) => {
  workspaces.value = list;
  const mine = current.value;
  if (mine) current.value = list.find((w) => w.id === mine.id) ?? mine;
});

rpc.on('workspace.attached', (info) => {
  if (info?.id !== current.value?.id) resetProjectScope();
  current.value = info;
});

rpc.on('workspace.closed', ({ id }) => {
  if (current.value?.id !== id) return;
  resetProjectScope();
  current.value = null;
});

rpc.on('log', (line) => {
  logs.value = [...logs.value.slice(-499), line];
});
