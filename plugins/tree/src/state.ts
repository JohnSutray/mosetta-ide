import { fs, t } from '@ide/api/client';
import { flushDocs, openFile } from '@ide/plugin-doc';
import type { Ide } from '@ide/api/client';
import type { FileTree } from './file-tree.js';
import { batch, signal } from '@preact/signals';
import type { EntryKind } from '@ide/api/client';

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

export class Prompt {
  readonly ask = signal<Ask | null>(null);

  readonly draft = signal('');

  private nextId = 1;

  show(spec: Omit<Ask, 'id'>): void {
    batch(() => {
      this.draft.value = spec.value ?? '';
      this.ask.value = { ...spec, id: this.nextId++ };
    });
  }

  cancel(): void {
    this.ask.value = null;
  }

  async answer(): Promise<void> {
    const asked = this.ask.value;
    if (!asked) return;
    const answer = this.draft.value.trim();
    if (asked.field && answer === '') return;
    try {
      await asked.run(answer);
      this.ask.value = null;
    } catch (err) {
      this.ask.value = { ...asked, error: describe(err) };
    }
  }
}

export class TreeSelection {
  constructor(private readonly files: FileTree) {}

  readonly focus = signal<string | null>(null);

  readonly picked = signal<Set<string>>(new Set());

  readonly anchor = signal<string | null>(null);

  targets(path: string): string[] {
    const selection = this.picked.value;
    return selection.has(path) && selection.size > 1 ? [...selection] : [path];
  }

  only(path: string): void {
    batch(() => {
      this.picked.value = new Set([path]);
      this.anchor.value = path;
      this.focus.value = path;
    });
  }

  clear(): void {
    this.picked.value = new Set();
  }

  toggle(path: string): void {
    const next = new Set(this.picked.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    batch(() => {
      this.picked.value = next;
      this.anchor.value = path;
      this.focus.value = path;
    });
  }

  range(path: string, visible: string[]): void {
    const anchor = this.anchor.value ?? path;
    const from = visible.indexOf(anchor);
    const to = visible.indexOf(path);
    if (from === -1 || to === -1) {
      this.only(path);
      return;
    }
    const [start, end] = from <= to ? [from, to] : [to, from];
    batch(() => {
      this.picked.value = new Set(visible.slice(start, end + 1));
      this.focus.value = path;
    });
  }

  visibleOrder(): string[] {
    const out: string[] = [];
    const walk = (path: string) => {
      for (const entry of this.files.children.value.get(path) ?? []) {
        out.push(entry.path);
        if (entry.kind === 'dir' && this.files.expanded.value.has(entry.path)) walk(entry.path);
      }
    };
    walk('');
    return out;
  }

  isDir(path: string): boolean {
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    return this.files.children.value.get(parent)?.find((item) => item.path === path)?.kind === 'dir';
  }

  step(delta: number): void {
    const order = this.visibleOrder();
    if (order.length === 0) return;
    const at = order.indexOf(this.focus.value ?? '');
    const next = at === -1 ? (delta > 0 ? 0 : order.length - 1) : at + delta;
    const path = order[Math.max(0, Math.min(order.length - 1, next))];
    if (path !== undefined) this.only(path);
  }

  openBranch(): void {
    const path = this.focus.value;
    if (!path) return;
    if (this.isDir(path) && !this.files.expanded.value.has(path)) {
      void this.files.toggle(path);
      return;
    }
    this.step(1);
  }

  closeBranch(): void {
    const path = this.focus.value;
    if (!path) return;
    if (this.isDir(path) && this.files.expanded.value.has(path)) {
      void this.files.toggle(path);
      return;
    }
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    if (parent !== '') this.only(parent);
  }

  async reveal(path: string): Promise<void> {
    const parts = path.split('/');
    parts.pop();

    const dirs: string[] = [];
    let at = '';
    for (const part of parts) {
      at = at === '' ? part : `${at}/${part}`;
      dirs.push(at);
    }

    if (this.shown(path, dirs)) return;

    const missing = dirs.filter((dir) => !this.files.expanded.value.has(dir));
    if (missing.length > 0) {
      const open = new Set(this.files.expanded.value);
      for (const dir of missing) open.add(dir);
      this.files.expanded.value = open;
    }

    for (const dir of dirs) {
      if (!this.files.children.value.has(dir)) await this.files.load(dir);
    }
    this.only(path);
  }

  takeKeyboard(): void {
    if (document.activeElement !== document.body) return;
    (document.querySelector('.tree-typeahead') as HTMLElement | null)?.focus();
  }

  private shown(path: string, dirs: string[]): boolean {
    const selection = this.picked.value;
    return (
      this.focus.value === path &&
      selection.size === 1 &&
      selection.has(path) &&
      dirs.every((dir) => this.files.expanded.value.has(dir) && this.files.children.value.has(dir))
    );
  }
}

export class TreeOps {
  readonly clipboard = signal<{ paths: string[]; cut: boolean } | null>(null);

  constructor(
    private readonly selection: TreeSelection,
    private readonly prompt: Prompt,
    private readonly files: FileTree,
    private readonly ide: Ide,
    private readonly reveal: (path: string) => Promise<void>,
  ) {}

  create(at: string, isDir: boolean, kind: EntryKind): void {
    const parent = parentOf(at, isDir);
    this.prompt.show({
      title: kind === 'dir' ? t('tree.newFolder') : t('tree.newFile'),
      text: parent === '' ? t('tree.inRoot') : parent,
      field: true,
      value: '',
      confirm: t('tree.create'),
      run: async (name) => {
        const path = parent === '' ? name : `${parent}/${name}`;
        await fs.create(path, kind);
        await this.files.load(parent);
        await this.files.ensureExpanded(parent);
        if (kind === 'file') await openFile(path);
      },
    });
  }

  rename(path: string): void {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    this.prompt.show({
      title: t('tree.rename'),
      text: path,
      field: true,
      value: name,
      confirm: t('tree.rename.do'),
      run: async (next) => {
        if (next === name) return;
        const to = parent === '' ? next : `${parent}/${next}`;
        await flushDocs();
        await fs.move(path, to);
        await this.files.load(parent);
        this.ide.say(t('tree.renamed', { name: next }));
      },
    });
  }

  remove(path: string, isDir: boolean): void {
    const paths = this.selection.targets(path);
    const many = paths.length > 1;
    this.prompt.show({
      title: many
        ? t('tree.deleteMany', { count: paths.length })
        : isDir
          ? t('tree.deleteFolder')
          : t('tree.deleteFile'),
      text: `${paths.join('\n')}\n\n${t('tree.deleteWarn')}`,
      field: false,
      confirm: t('tree.delete.do'),
      danger: true,
      run: async () => {
        for (const item of paths) {
          await fs.remove(item);
          await this.files.load(item.slice(0, Math.max(0, item.lastIndexOf('/'))));
        }
        this.selection.clear();
        this.ide.say(many ? t('tree.deletedMany', { count: paths.length }) : t('tree.deleted', { path }));
      },
    });
  }

  copy(path: string, cut: boolean): void {
    const paths = this.selection.targets(path);
    this.clipboard.value = { paths, cut };
    const what = paths.length > 1 ? t('tree.items', { count: paths.length }) : paths[0]!;
    this.ide.say(cut ? t('tree.cut.done', { path: what }) : t('tree.copied', { path: what }));
  }

  async copyAbsolutePath(path: string): Promise<void> {
    try {
      const absolute = await fs.absolute(path);
      await navigator.clipboard.writeText(absolute);
      this.ide.say(t('tree.pathCopied', { path: absolute }));
    } catch (err) {
      this.ide.complain(describe(err));
    }
  }

  async revealInOs(path: string): Promise<void> {
    try {
      await this.reveal(path);
    } catch (err) {
      this.ide.complain(describe(err));
    }
  }

  async dropInto(paths: string[], folder: string, copy: boolean): Promise<void> {
    if (!copy) await flushDocs();
    for (const from of paths) {
      const name = from.slice(from.lastIndexOf('/') + 1);
      const to = join(folder, name);
      if (to === from) continue;
      if (folder === from || folder.startsWith(`${from}/`)) {
        this.ide.complain(t('tree.intoItself'));
        return;
      }
      try {
        if (copy) await fs.copy(from, to);
        else await fs.move(from, to);
      } catch (err) {
        this.ide.complain(describe(err));
        return;
      }
      await this.files.load(from.slice(0, Math.max(0, from.lastIndexOf('/'))));
    }
    await this.files.load(folder);
    await this.files.ensureExpanded(folder);
    this.selection.clear();
    this.ide.say(
      copy ? t('tree.copiedInto', { folder: folder || '/' }) : t('tree.movedInto', { folder: folder || '/' }),
    );
  }

  async pasteInto(at: string, isDir: boolean): Promise<void> {
    const parent = parentOf(at, isDir);
    const own = this.clipboard.value;
    if (own) {
      await this.dropInto(own.paths, parent, !own.cut);
      if (own.cut) this.clipboard.value = null;
      return;
    }
    await this.pasteFromSystem(parent);
  }

  async pasteFromSystem(parent: string): Promise<void> {
    if (!navigator.clipboard?.read) {
      this.ide.complain(t('tree.noClipboard'));
      return;
    }
    let items: ClipboardItem[];
    try {
      items = await navigator.clipboard.read();
    } catch (err) {
      this.ide.complain(describe(err));
      return;
    }

    for (const item of items) {
      const image = item.types.find((type) => type.startsWith('image/'));
      if (image) {
        const blob = await item.getType(image);
        const extension = image.slice('image/'.length).replace('svg+xml', 'svg');
        const name = await this.freeName(parent, 'image', extension);
        await fs.writeBytes(join(parent, name), await toBase64(blob));
        await this.files.load(parent);
        await this.files.ensureExpanded(parent);
        this.ide.say(t('tree.pasted', { name }));
        return;
      }
    }

    const text = await navigator.clipboard.readText().catch(() => '');
    if (text.trim() === '') {
      this.ide.complain(t('tree.clipboardEmpty'));
      return;
    }
    this.prompt.show({
      title: t('tree.pasteText'),
      text: text.slice(0, 200),
      field: true,
      value: '',
      confirm: t('tree.create'),
      run: async (name) => {
        const path = join(parent, name);
        await fs.create(path, 'file');
        await fs.write(path, text);
        await this.files.load(parent);
        await openFile(path);
      },
    });
  }

  private async freeName(parent: string, base: string, extension: string): Promise<string> {
    await this.files.load(parent);
    const taken = new Set((this.files.children.value.get(parent) ?? []).map((e) => e.name));
    for (let n = 1; ; n += 1) {
      const name = `${base}_${n}.${extension}`;
      if (!taken.has(name)) return name;
    }
  }
}

function parentOf(path: string, isDir: boolean): string {
  if (isDir) return path;
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
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
