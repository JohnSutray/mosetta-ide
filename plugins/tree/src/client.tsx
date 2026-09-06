import { activate, openDoc, openFile, project, registry, remote, stub, tree, workspaces } from '@ide/api/client';
import LspPlugin from '@ide/plugin-lsp';
import type { Ide } from '@ide/api/client';
import { computed, effect } from '@preact/signals';
import { FollowIcon, TreeIcon } from './icons.js';
import { FileTree } from './file-tree.js';
import { TreeFollow } from './follow.js';
import { TreeMenuState } from './menu.js';
import { Prompt as PromptState, TreeOps, TreeSelection } from './state.js';
import { STYLE } from './style.js';
import { TINT_SCHEMA, TreeTints, type TintSource } from './tints.js';
import { Prompt } from './prompt.js';
import { Tree } from './tree.js';
import { TreeMenu } from './tree-menu.js';

@registry({ key: 'tree.tint', schema: TINT_SCHEMA })
export default class TreePlugin {
  readonly files: FileTree;
  readonly prompt = new PromptState();
  readonly selection: TreeSelection;
  readonly ops: TreeOps;
  readonly follow: TreeFollow;
  readonly menu = new TreeMenuState();
  readonly tints: TreeTints;
  readonly shown;

  readonly broken = computed(() => {
    const out = new Set<string>();
    for (const file of this.ide.getPlugin(LspPlugin).problems.value) {
      if (!file.diagnostics.some((item) => item.severity === 'error')) continue;
      out.add(file.path);
      let at = file.path.lastIndexOf('/');
      while (at > 0) {
        out.add(file.path.slice(0, at));
        at = file.path.lastIndexOf('/', at - 1);
      }
    }
    return out;
  });

  constructor(private readonly ide: Ide) {
    this.files = new FileTree(tree, (message) => ide.complain(message));
    this.selection = new TreeSelection(this.files);
    this.ops = new TreeOps(this.selection, this.prompt, this.files, ide, (path) => this.askReveal({ path }));
    this.follow = new TreeFollow(this.selection, ide);
    this.tints = new TreeTints(ide.registry<TintSource>('tree.tint'));
    this.shown = ide.remember('panel.tree', true);
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    effect(() => {
      workspaces.current.value;
      this.files.reset();
    });
    effect(() => {
      if (project.value) void this.files.load('').catch((err) => this.ide.complain(describe(err)));
    });
    tree.onChanged((event) => this.files.refresh(event.path));

    this.ide.command('panel.tree', () => {
      this.shown.value = !this.shown.value;
    });

    const { selection, ops } = this;
    this.ide.command('tree.next', () => selection.step(1));
    this.ide.command('tree.prev', () => selection.step(-1));
    this.ide.command('tree.expand', () => selection.openBranch());
    this.ide.command('tree.collapse', () => selection.closeBranch());
    this.ide.command('tree.newFile', () => this.onFocused((path, isDir) => ops.create(path, isDir, 'file')));
    this.ide.command('tree.newFolder', () => this.onFocused((path, isDir) => ops.create(path, isDir, 'dir')));
    this.ide.command('tree.open', () =>
      this.onPicked((path, isDir) => {
        if (isDir) void this.files.toggle(path);
        else void openFile(path, { focus: true });
      }),
    );
    this.ide.command('tree.rename', () => this.onPicked((path) => ops.rename(path)));
    this.ide.command('tree.delete', () => this.onPicked((path, isDir) => ops.remove(path, isDir)));
    this.ide.command('tree.copy', () => this.onPicked((path) => ops.copy(path, false)));
    this.ide.command('tree.cut', () => this.onPicked((path) => ops.copy(path, true)));
    this.ide.command('tree.paste', () => this.onFocused((path, isDir) => void ops.pasteInto(path, isDir)));
    this.ide.command('tree.copyPath', () => this.onPicked((path) => void ops.copyAbsolutePath(path)));
    this.ide.command('tree.reveal', () => this.onPicked((path) => void ops.revealInOs(path)));
    this.ide.command('tree.follow', () => void this.follow.toggle());
    this.ide.command('prompt.confirm', () => void this.prompt.answer());

    this.ide.registry('toolbar.button').add({
      id: 'tree',
      title: 'toolbar.tree',
      command: 'panel.tree',
      icon: (filled: boolean) => <TreeIcon filled={filled} />,
      active: this.shown,
    });
    this.ide.registry('toolbar.button').add({
      id: 'tree.follow',
      title: 'toolbar.follow',
      command: 'tree.follow',
      icon: (filled: boolean) => <FollowIcon filled={filled} />,
      active: this.follow.on,
    });

    this.ide.registry('panel').add({
      id: 'tree',
      title: 'panel.tree',
      side: 'left',
      open: this.shown,
      view: () => (
        <Tree
          files={this.files}
          selection={this.selection}
          ops={this.ops}
          menu={this.menu}
          tints={this.tints}
          broken={this.broken}
        />
      ),
      close: () => {
        this.shown.value = false;
      },
      defaultWidth: 260,
      minWidth: 150,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => (
      <>
        <Prompt prompt={this.prompt} selection={this.selection} />
        <TreeMenu menu={this.menu} selection={this.selection} ops={this.ops} />
      </>
    ));

    effect(() => {
      const path = openDoc.value?.path;
      if (path) void this.follow.now();
    });

    document.addEventListener('mousedown', (event) => {
      if (!(event.target as HTMLElement).closest('.tree-menu')) this.menu.close();
    });
  }

  @remote('reveal') protected askReveal(_params: { path: string }): Promise<void> {
    return stub();
  }

  private onFocused(run: (path: string, isDir: boolean) => void): void {
    const path = this.selection.focus.value ?? '';
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    const entry = this.files.children.value.get(parent)?.find((item) => item.path === path);
    run(path, path === '' ? true : entry?.kind === 'dir');
  }

  private onPicked(run: (path: string, isDir: boolean) => void): void {
    const path = this.selection.focus.value;
    if (!path) return;
    this.onFocused(run);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
