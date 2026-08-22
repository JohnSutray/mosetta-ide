import { batch, computed, signal } from '@preact/signals';
import type {
  Diagnostic,
  DirEntry,
  DocState,
  LogLine,
  LspStatus,
  WorkspaceInfo,
} from '@ide/protocol';
import { RpcClient, RpcFailure } from '../rpc/client.js';
import { notify } from './notifications.js';
import { t } from '../i18n/index.js';
import { applyConfig } from './config.js';
import { DocSync } from './doc-sync.js';

export const rpc = new RpcClient();

export const workspaces = signal<WorkspaceInfo[]>([]);
export const current = signal<WorkspaceInfo | null>(null);
export const logs = signal<LogLine[]>([]);
export const connected = rpc.connected;

export const dirChildren = signal<Map<string, DirEntry[]>>(new Map());
export const expanded = signal<Set<string>>(new Set());
export const rootExpanded = signal(true);
export const openFile = signal<DocState | null>(null);
export const fileHistory = signal<string[]>([]);
export const externalEpoch = signal(0);

export const pendingReveal = signal<{ path: string; line: number; epoch: number } | null>(null);

export function reveal(path: string, line: number): void {
  const epoch = (pendingReveal.value?.epoch ?? 0) + 1;
  pendingReveal.value = { path, line, epoch };
}
export const dirty = signal(false);
export function say(message: string): void {
  notify(message, 'info');
}

export function complain(message: string): void {
  notify(message, 'error');
}

export const diagnostics = signal<Map<string, Diagnostic[]>>(new Map());
export const lspStatuses = signal<LspStatus[]>([]);
export const treePanelVisible = signal(true);
export const problemsPanelVisible = signal(false);
export const terminalPanelVisible = signal(false);

export const currentDiagnostics = computed<Diagnostic[]>(() => {
  const path = openFile.value?.path;
  return path ? (diagnostics.value.get(path) ?? []) : [];
});

export const errorCount = computed(
  () => currentDiagnostics.value.filter((d) => d.severity === 'error').length,
);

export const title = computed(() => {
  const ws = current.value;
  const file = openFile.value;
  if (!ws) return 'web-ide';
  return file ? `${file.path} — ${ws.name}` : ws.name;
});

export const docSync = new DocSync(rpc, (message) => complain(message));

function resetProjectScope() {
  docSync.detach();
  batch(() => {
    dirChildren.value = new Map();
    fileHistory.value = [];
    expanded.value = new Set();
    rootExpanded.value = true;
    openFile.value = null;
    dirty.value = false;
    diagnostics.value = new Map();
    lspStatuses.value = [];
    problemsPanelVisible.value = false;
    terminalPanelVisible.value = false;
  });
}

export async function openProject(root: string) {
  try {
    const info = await rpc.call('workspace.open', { root });
    resetProjectScope();
    current.value = info;
    await afterAttach();
  } catch (err) {
    complain(describe(err));
  }
}

export async function switchProject(id: string) {
  if (current.value?.id === id) return;
  try {
    const info = await rpc.call('workspace.attach', { id });
    resetProjectScope();
    current.value = info;
    await afterAttach();
  } catch (err) {
    complain(describe(err));
  }
}

async function afterAttach() {
  await loadDir('');
  lspStatuses.value = await rpc.call('lsp.status', null);
}

export async function loadDir(path: string) {
  const entries = await rpc.call('tree.list', { path });
  const next = new Map(dirChildren.value);
  next.set(path, entries);
  dirChildren.value = next;
}

export async function ensureExpanded(path: string): Promise<void> {
  if (path === '' || expanded.value.has(path)) return;
  await toggleDir(path);
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
      complain(describe(err));
    }
  }
}

export async function openFileAt(path: string) {
  try {
    const previous = openFile.value;
    if (previous && previous.path !== path) {
      await docSync.flush();
      void rpc.call('doc.close', { path: previous.path });
    }
    const doc = await rpc.call('doc.open', { path });
    docSync.attach(doc);
    batch(() => {
      fileHistory.value = [path, ...fileHistory.value.filter((item) => item !== path)].slice(0, 20);
      openFile.value = doc;
      dirty.value = doc.dirty;
    });
    const known = await rpc.call('lsp.diagnostics', { path }).catch(() => null);
    if (known) setDiagnostics(known.path, known.diagnostics);
  } catch (err) {
    complain(describe(err));
  }
}

export async function closeFile(): Promise<void> {
  const file = openFile.value;
  if (!file) return;
  try {
    await docSync.flush();
  } finally {
    docSync.detach();
    void rpc.call('doc.close', { path: file.path });
    batch(() => {
      openFile.value = null;
      dirty.value = false;
    });
  }
}

export function editDoc(text: string) {
  dirty.value = true;
  docSync.edit(text);
}

export async function saveDoc() {
  const file = openFile.value;
  if (!file) return;
  try {
    await docSync.flush();
    const saved = await rpc.call('doc.save', { path: file.path });
    docSync.attach(saved);
    batch(() => {
      openFile.value = saved;
      dirty.value = false;
    });
  } catch (err) {
    complain(describe(err));
  }
}

export async function reloadDoc() {
  const file = openFile.value;
  if (!file) return;
  try {
    const doc = await rpc.call('doc.reload', { path: file.path });
    docSync.attach(doc);
    batch(() => {
      openFile.value = doc;
      dirty.value = false;
      externalEpoch.value += 1;
    });
    say(t('file.reloaded', { path: doc.path }));
  } catch (err) {
    complain(describe(err));
  }
}

function setDiagnostics(path: string, list: Diagnostic[]) {
  const next = new Map(diagnostics.value);
  next.set(path, list);
  diagnostics.value = next;
}

function describe(err: unknown): string {
  if (err instanceof RpcFailure) return err.message;
  return err instanceof Error ? err.message : String(err);
}

rpc.on('config.changed', (bundle) => applyConfig(bundle));

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

rpc.on('doc.changed', (event) => {
  if (openFile.value?.path !== event.path) return;
  dirty.value = event.dirty;
});

rpc.on('doc.external', (event) => {
  if (openFile.value?.path !== event.path) return;
  void rpc
    .call('doc.state', { path: event.path })
    .then((doc) => {
      docSync.attach(doc);
      batch(() => {
        openFile.value = doc;
        dirty.value = false;
        externalEpoch.value += 1;
      });
      say(t('file.external', { path: event.path }));
    })
    .catch((err) => complain(describe(err)));
});

rpc.on('doc.conflict', (event) => {
  if (openFile.value?.path !== event.path) return;
  complain(
    t('file.dirtyConflict', { path: event.path }),
  );
});

rpc.on('doc.removed', (event) => {
  if (openFile.value?.path !== event.path) return;
  const back = fileHistory.value.find((path) => path !== event.path);
  batch(() => {
    fileHistory.value = fileHistory.value.filter((path) => path !== event.path);
    openFile.value = null;
    dirty.value = false;
  });
  docSync.detach();
  complain(t('file.gone', { path: event.path }));
  if (back) void openFileAt(back);
});

rpc.on('tree.changed', (event) => {
  if (!dirChildren.value.has(event.path)) return;
  void loadDir(event.path).catch(() => {});
});

rpc.on('lsp.diagnostics', (event) => setDiagnostics(event.path, event.diagnostics));

rpc.on('lsp.status', (status) => {
  const next = lspStatuses.value.filter((s) => s.server !== status.server);
  lspStatuses.value = [...next, status];
});

rpc.on('log', (line) => {
  logs.value = [...logs.value.slice(-499), line];
});
