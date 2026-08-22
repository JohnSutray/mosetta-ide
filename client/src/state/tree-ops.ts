import { batch, signal } from '@preact/signals';
import type { EntryKind } from '@ide/protocol';
import {
  complain,
  current,
  dirChildren,
  docSync,
  ensureExpanded,
  expanded,
  loadDir,
  openFileAt,
  rpc,
  say,
  toggleDir,
} from './session.js';
import { t } from '../i18n/index.js';

export interface Ask {
  id: number;
  title: string;
  text?: string;
  field: boolean;
  value?: string;
  confirm: string;
  danger?: boolean;
  error?: string;
  run: (value: string) => Promise<void>;
}

export const prompt = signal<Ask | null>(null);

export const promptDraft = signal('');

export const clipboard = signal<{ paths: string[]; cut: boolean } | null>(null);

export const treeFocus = signal<string | null>(null);

export const treeSelection = signal<Set<string>>(new Set());

export const treeAnchor = signal<string | null>(null);

export function targets(path: string): string[] {
  const selection = treeSelection.value;
  return selection.has(path) && selection.size > 1 ? [...selection] : [path];
}

export function selectOnly(path: string): void {
  batch(() => {
    treeSelection.value = new Set([path]);
    treeAnchor.value = path;
    treeFocus.value = path;
  });
}

export function toggleSelected(path: string): void {
  const next = new Set(treeSelection.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  batch(() => {
    treeSelection.value = next;
    treeAnchor.value = path;
    treeFocus.value = path;
  });
}

export function visibleOrder(): string[] {
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

export function isDir(path: string): boolean {
  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  return dirChildren.value.get(parent)?.find((item) => item.path === path)?.kind === 'dir';
}

export function stepTree(delta: number): void {
  const order = visibleOrder();
  if (order.length === 0) return;
  const at = order.indexOf(treeFocus.value ?? '');
  const next = at === -1 ? (delta > 0 ? 0 : order.length - 1) : at + delta;
  const path = order[Math.max(0, Math.min(order.length - 1, next))];
  if (path !== undefined) selectOnly(path);
}

export function openTreeBranch(): void {
  const path = treeFocus.value;
  if (!path) return;
  if (isDir(path) && !expanded.value.has(path)) {
    void toggleDir(path);
    return;
  }
  stepTree(1);
}

export function closeTreeBranch(): void {
  const path = treeFocus.value;
  if (!path) return;
  if (isDir(path) && expanded.value.has(path)) {
    void toggleDir(path);
    return;
  }
  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  if (parent !== '') selectOnly(parent);
}

export function selectRange(path: string, visible: string[]): void {
  const anchor = treeAnchor.value ?? path;
  const from = visible.indexOf(anchor);
  const to = visible.indexOf(path);
  if (from === -1 || to === -1) {
    selectOnly(path);
    return;
  }
  const [start, end] = from <= to ? [from, to] : [to, from];
  batch(() => {
    treeSelection.value = new Set(visible.slice(start, end + 1));
    treeFocus.value = path;
  });
}

let nextAsk = 1;

function ask(spec: Omit<Ask, 'id'>): void {
  batch(() => {
    promptDraft.value = spec.value ?? '';
    prompt.value = { ...spec, id: nextAsk++ };
  });
}

export function promptCancel(): void {
  prompt.value = null;
}

export async function promptAnswer(): Promise<void> {
  const current_ = prompt.value;
  if (!current_) return;
  const answer = promptDraft.value.trim();
  if (current_.field && answer === '') return;
  try {
    await current_.run(answer);
    prompt.value = null;
  } catch (err) {
    prompt.value = { ...current_, error: describe(err) };
  }
}

function parentOf(path: string, isDir: boolean): string {
  if (isDir) return path;
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}

export function askCreate(at: string, isDir: boolean, kind: EntryKind): void {
  const parent = parentOf(at, isDir);
  ask({
    title: kind === 'dir' ? t('tree.newFolder') : t('tree.newFile'),
    text: parent === '' ? t('tree.inRoot') : parent,
    field: true,
    value: '',
    confirm: t('tree.create'),
    run: async (name) => {
      const path = parent === '' ? name : `${parent}/${name}`;
      await rpc.call('fs.create', { path, kind });
      await loadDir(parent);
      await ensureExpanded(parent);
      if (kind === 'file') await openFileAt(path);
    },
  });
}

export function askRename(path: string): void {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  ask({
    title: t('tree.rename'),
    text: path,
    field: true,
    value: name,
    confirm: t('tree.rename.do'),
    run: async (next) => {
      if (next === name) return;
      const to = parent === '' ? next : `${parent}/${next}`;
      await docSync.flush();
      await rpc.call('fs.move', { from: path, to });
      await loadDir(parent);
      say(t('tree.renamed', { name: next }));
    },
  });
}

export function askRemove(path: string, isDir: boolean): void {
  const paths = targets(path);
  const many = paths.length > 1;
  ask({
    title: many ? t('tree.deleteMany', { count: paths.length }) : isDir ? t('tree.deleteFolder') : t('tree.deleteFile'),
    text: `${paths.join('\n')}\n\n${t('tree.deleteWarn')}`,
    field: false,
    confirm: t('tree.delete.do'),
    danger: true,
    run: async () => {
      for (const item of paths) {
        await rpc.call('fs.remove', { path: item });
        await loadDir(item.slice(0, Math.max(0, item.lastIndexOf('/'))));
      }
      treeSelection.value = new Set();
      say(many ? t('tree.deletedMany', { count: paths.length }) : t('tree.deleted', { path }));
    },
  });
}

export function copyToClipboard(path: string, cut: boolean): void {
  const paths = targets(path);
  clipboard.value = { paths, cut };
  const what = paths.length > 1 ? t('tree.items', { count: paths.length }) : paths[0]!;
  say(cut ? t('tree.cut.done', { path: what }) : t('tree.copied', { path: what }));
}

export async function copyAbsolutePath(path: string): Promise<void> {
  try {
    const { path: absolute } = await rpc.call('fs.absolute', { path });
    await navigator.clipboard.writeText(absolute);
    say(t('tree.pathCopied', { path: absolute }));
  } catch (err) {
    complain(describe(err));
  }
}

export async function revealInOs(path: string): Promise<void> {
  try {
    await rpc.call('fs.reveal', { path });
  } catch (err) {
    complain(describe(err));
  }
}

export async function dropInto(paths: string[], folder: string, copy: boolean): Promise<void> {
  if (!copy) await docSync.flush();
  for (const from of paths) {
    const name = from.slice(from.lastIndexOf('/') + 1);
    const to = join(folder, name);
    if (to === from) continue;
    if (folder === from || folder.startsWith(`${from}/`)) {
      complain(t('tree.intoItself'));
      return;
    }
    try {
      if (copy) await rpc.call('fs.copy', { from, to });
      else await rpc.call('fs.move', { from, to });
    } catch (err) {
      complain(describe(err));
      return;
    }
    await loadDir(from.slice(0, Math.max(0, from.lastIndexOf('/'))));
  }
  await loadDir(folder);
  await ensureExpanded(folder);
  treeSelection.value = new Set();
  say(copy ? t('tree.copiedInto', { folder: folder || '/' }) : t('tree.movedInto', { folder: folder || '/' }));
}

export async function pasteInto(at: string, isDir: boolean): Promise<void> {
  const parent = parentOf(at, isDir);
  const own = clipboard.value;
  if (own) {
    await dropInto(own.paths, parent, !own.cut);
    if (own.cut) clipboard.value = null;
    return;
  }
  await pasteFromSystem(parent);
}

export async function pasteFromSystem(parent: string): Promise<void> {
  if (!navigator.clipboard?.read) {
    complain(t('tree.noClipboard'));
    return;
  }
  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch (err) {
    complain(describe(err));
    return;
  }

  for (const item of items) {
    const image = item.types.find((type) => type.startsWith('image/'));
    if (image) {
      const blob = await item.getType(image);
      const extension = image.slice('image/'.length).replace('svg+xml', 'svg');
      const name = await freeName(parent, 'image', extension);
      await rpc.call('fs.writeBytes', { path: join(parent, name), base64: await toBase64(blob) });
      await loadDir(parent);
      await ensureExpanded(parent);
      say(t('tree.pasted', { name }));
      return;
    }
  }

  const text = await navigator.clipboard.readText().catch(() => '');
  if (text.trim() === '') {
    complain(t('tree.clipboardEmpty'));
    return;
  }
  ask({
    title: t('tree.pasteText'),
    text: text.slice(0, 200),
    field: true,
    value: '',
    confirm: t('tree.create'),
    run: async (name) => {
      const path = join(parent, name);
      await rpc.call('fs.create', { path, kind: 'file' });
      await rpc.call('fs.write', { path, text });
      await loadDir(parent);
      await openFileAt(path);
    },
  });
}

async function freeName(parent: string, base: string, extension: string): Promise<string> {
  const taken = new Set((await rpc.call('tree.list', { path: parent })).map((e) => e.name));
  for (let n = 1; ; n += 1) {
    const name = `${base}_${n}.${extension}`;
    if (!taken.has(name)) return name;
  }
}

function join(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function focusTree(): void {
  if (document.activeElement !== document.body) return;
  (document.querySelector('.tree') as HTMLElement | null)?.focus();
}

export function hasProject(): boolean {
  return current.value !== null;
}

export { batch };
