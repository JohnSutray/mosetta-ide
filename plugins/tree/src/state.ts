import type { Ide } from '@mosetta/ide-api/client';
export type { Ask } from '@mosetta/ide-plugin-ui';
import type { FileTree } from './file-tree.js';
import { batch, signal } from '@preact/signals';
import { Asking } from '@mosetta/ide-plugin-ui';
import type { EntryKind } from '@mosetta/ide-api/client';
import DocPlugin from '@mosetta/ide-plugin-doc';

/**
 * What is selected in the tree and where the arrows walk.
 *
 * The order of the shown rows lives here rather than in the component precisely because
 * both the commands and the drawing need it: they have no right to drift apart — it is
 * computed from the same signals the tree is drawn from.
 */
export class TreeSelection {
  /**
   * The tree's contents arrive through the CONSTRUCTOR.
   *
   * This is the PLUGIN's memory: the selection is computed from the same thing the tree
   * is drawn from. And a test sets up its own — on a fake wire — with no shared state
   * at all.
   */
  constructor(
    private readonly files: FileTree,
    /** Focus is "nowhere": the page body, or the IDE's root. */
    private readonly idle: (el: Element | null) => boolean = (el) => el === null || el === document.body,
  ) {}

  /** The row the tree's focus stands on. Actions apply to it. */
  readonly focus = signal<string | null>(null);

  /**
   * The selected rows. Usually one — the same one under the focus; but Shift and the
   * leading modifier gather several, and then the action applies to all of them at
   * once.
   */
  readonly picked = signal<Set<string>>(new Set());

  /** The row Shift counts its range from. */
  readonly anchor = signal<string | null>(null);

  /**
   * The paths an action applies to: the selection, if the target is in it, otherwise
   * the target itself. The rule is the same as in Finder: click outside the selection
   * and we work with what was clicked, while the selection is reset.
   */
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

  /**
   * The range from the anchor to the row — by the SHOWN order rather than
   * alphabetically.
   */
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

  /** The order of the SHOWN rows: the arrows walk by it and Shift is computed from it. */
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

  /**
   * Whether this is a directory. The tree knows its own contents; there is no point
   * asking the server.
   */
  isDir(path: string): boolean {
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    return this.files.children.value.get(parent)?.find((item) => item.path === path)?.kind === 'dir';
  }

  /**
   * One step of an arrow. Nothing selected means we land on the first row: a key is
   * obliged to do something rather than stay silent.
   */
  step(delta: number): void {
    const order = this.visibleOrder();
    if (order.length === 0) return;
    const at = order.indexOf(this.focus.value ?? '');
    const next = at === -1 ? (delta > 0 ? 0 : order.length - 1) : at + delta;
    const path = order[Math.max(0, Math.min(order.length - 1, next))];
    if (path !== undefined) this.only(path);
  }

  /**
   * Right arrow: expand a directory, and step inside an expanded one. Left arrow:
   * collapse, and for a file or a collapsed directory go to the parent. The same
   * behaviour as in every tree in every IDE.
   */
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

  /**
   * Reveal a file in the tree: expand the path to it and highlight it.
   *
   * We expand ALL the directories at once FIRST and then read their contents: otherwise
   * the tree would redraw three times half-empty and the row would jump.
   *
   * We do not touch somebody else's focus: `focus` here is a row's highlight rather
   * than the OS focus. The tree takes aim at the file, but the keyboard stays where it
   * was.
   *
   * **It does nothing if everything is shown already.** This is not an optimisation but
   * a support: a click in the tree opens a file, an open file calls for a reveal, and a
   * reveal touches the selection again — that is, there is a loop here, it is simply
   * closed on one path. As long as revealing what is already revealed writes no
   * signals, the loop dies out by itself.
   */
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

  /**
   * A request to move the keyboard into the tree — as a COUNTER, by the same device the
   * editor uses. The panel may not be drawn yet at that moment: the command changes a
   * signal, and the field appears on the next frame. The counter waits for it as long
   * as it takes.
   */
  readonly wantsKeyboard = signal(0);

  /** Is the keyboard in the tree right now? */
  hasKeyboard(): boolean {
    const active = document.activeElement as { closest?: (selector: string) => unknown } | null;
    return Boolean(active?.closest?.('.tree'));
  }

  /**
   * Give the tree the keyboard. A request rather than an order: the drawing will carry
   * it out — and carry it out WITHOUT SCROLLING.
   */
  focusTree(): void {
    this.wantsKeyboard.value += 1;
  }

  /**
   * Give the keyboard back to the tree.
   *
   * A modal and a context menu take the focus, and on closing it settles on `body` —
   * and the tree's next key goes nowhere. The condition matters: if the focus left
   * deliberately (a file was created and opened in the editor), taking it back is not
   * on.
   */
  takeKeyboard(): void {
    if (!this.idle(document.activeElement)) return;
    this.focusTree();
  }

  /** The file is already expanded and highlighted — there is nothing to touch. */
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

/**
 * Operations on the tree's files.
 *
 * There is almost no state of its own — only the tree's "clipboard"; everything else is
 * actions. The selection and the modal arrive through the CONSTRUCTOR: it needs them,
 * but it must not own them. Files are moved through the contract (`fs`) and opened
 * through the core: a plugin has no wire to the core's server, and rightly so — the
 * core lends tools for syncing rather than the socket.
 */
export class TreeOps {
  /** What lies in the tree's "clipboard": the paths, and what to do with them on paste. */
  readonly clipboard = signal<{ paths: string[]; cut: boolean } | null>(null);

  constructor(
    private readonly selection: TreeSelection,
    private readonly prompt: Asking,
    private readonly files: FileTree,
    private readonly ide: Ide,
    /** Reveal in the OS file manager — our own server half. */
    private readonly reveal: (path: string) => Promise<void>,
  ) {}

  create(at: string, isDir: boolean, kind: EntryKind): void {
    const parent = parentOf(at, isDir);
    this.prompt.show({
      title: kind === 'dir' ? this.ide.t('tree.newFolder') : this.ide.t('tree.newFile'),
      text: parent === '' ? this.ide.t('tree.inRoot') : parent,
      field: true,
      filename: true,
      value: '',
      confirm: this.ide.t('tree.create'),
      run: async (name) => {
        const path = parent === '' ? name : `${parent}/${name}`;
        await this.ide.fs.create(path, kind);
        await this.files.load(parent);
        await this.files.ensureExpanded(parent);
        if (kind === 'file') await this.ide.getPlugin(DocPlugin).openFile(path);
      },
    });
  }

  rename(path: string): void {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    this.prompt.show({
      title: this.ide.t('tree.rename'),
      text: path,
      field: true,
      filename: true,
      value: name,
      confirm: this.ide.t('tree.rename.do'),
      run: async (next) => {
        if (next === name) return;
        const to = parent === '' ? next : `${parent}/${next}`;
        await this.ide.getPlugin(DocPlugin).flushDocs();
        await this.ide.fs.move(path, to);
        await this.files.load(parent);
        this.ide.say(this.ide.t('tree.renamed', { name: next }));
      },
    });
  }

  remove(path: string, isDir: boolean): void {
    const paths = this.selection.targets(path);
    const many = paths.length > 1;
    this.prompt.show({
      title: many
        ? this.ide.t('tree.deleteMany', { count: paths.length })
        : isDir
          ? this.ide.t('tree.deleteFolder')
          : this.ide.t('tree.deleteFile'),
      text: `${paths.join('\n')}\n\n${this.ide.t('tree.deleteWarn')}`,
      field: false,
      confirm: this.ide.t('tree.delete.do'),
      danger: true,
      run: async () => {
        for (const item of paths) {
          await this.ide.fs.remove(item);
          await this.files.load(item.slice(0, Math.max(0, item.lastIndexOf('/'))));
        }
        this.selection.clear();
        this.ide.say(many ? this.ide.t('tree.deletedMany', { count: paths.length }) : this.ide.t('tree.deleted', { path }));
      },
    });
  }

  copy(path: string, cut: boolean): void {
    const paths = this.selection.targets(path);
    this.clipboard.value = { paths, cut };
    const what = paths.length > 1 ? this.ide.t('tree.items', { count: paths.length }) : paths[0]!;
    this.ide.say(cut ? this.ide.t('tree.cut.done', { path: what }) : this.ide.t('tree.copied', { path: what }));
  }

  /** The absolute path into the system clipboard: the server computes it, not us. */
  async copyAbsolutePath(path: string): Promise<void> {
    try {
      const absolute = await this.ide.fs.absolute(path);
      await navigator.clipboard.writeText(absolute);
      this.ide.say(this.ide.t('tree.pathCopied', { path: absolute }));
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

  /** Dragged into a directory: we move, and with Alt held, copy. */
  async dropInto(paths: string[], folder: string, copy: boolean): Promise<void> {
    if (!copy) await this.ide.getPlugin(DocPlugin).flushDocs();
    for (const from of paths) {
      const name = from.slice(from.lastIndexOf('/') + 1);
      const to = join(folder, name);
      if (to === from) continue;
      if (folder === from || folder.startsWith(`${from}/`)) {
        this.ide.complain(this.ide.t('tree.intoItself'));
        return;
      }
      try {
        if (copy) await this.ide.fs.copy(from, to);
        else await this.ide.fs.move(from, to);
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
      copy ? this.ide.t('tree.copiedInto', { folder: folder || '/' }) : this.ide.t('tree.movedInto', { folder: folder || '/' }),
    );
  }

  /**
   * Paste into a directory. First what lies in the TREE's clipboard (our own file),
   * then what is in the system clipboard: an image, or text.
   */
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

  /**
   * The system clipboard. An image's name is computed (`image_1.png`); for text and
   * somebody else's file it is not, so we ask.
   */
  async pasteFromSystem(parent: string): Promise<void> {
    if (!navigator.clipboard?.read) {
      this.ide.complain(this.ide.t('tree.noClipboard'));
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
        await this.ide.fs.writeBytes(join(parent, name), await toBase64(blob));
        await this.files.load(parent);
        await this.files.ensureExpanded(parent);
        this.ide.say(this.ide.t('tree.pasted', { name }));
        return;
      }
    }

    const text = await navigator.clipboard.readText().catch(() => '');
    if (text.trim() === '') {
      this.ide.complain(this.ide.t('tree.clipboardEmpty'));
      return;
    }
    this.prompt.show({
      title: this.ide.t('tree.pasteText'),
      text: text.slice(0, 200),
      field: true,
      filename: true,
      value: '',
      confirm: this.ide.t('tree.create'),
      run: async (name) => {
        const path = join(parent, name);
        await this.ide.fs.create(path, 'file');
        await this.ide.fs.write(path, text);
        await this.files.load(parent);
        await this.ide.getPlugin(DocPlugin).openFile(path);
      },
    });
  }

  /**
   * `image_1.png`, `image_2.png`… — the first free one in this directory. The taken
   * names come from our own memory: it reads the tree layer.
   */
  private async freeName(parent: string, base: string, extension: string): Promise<string> {
    await this.files.load(parent);
    const taken = new Set((this.files.children.value.get(parent) ?? []).map((e) => e.name));
    for (let n = 1; ; n += 1) {
      const name = `${base}_${n}.${extension}`;
      if (!taken.has(name)) return name;
    }
  }
}

/**
 * The directory we create inside: the directory itself, or the directory of the
 * selected file.
 */
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
