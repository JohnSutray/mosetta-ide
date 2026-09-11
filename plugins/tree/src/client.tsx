import { activate, configSection, plugin, registry, remote, stub } from '@mosetta/ide-api/client';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import type { Ide } from '@mosetta/ide-api/client';
import { computed, effect, untracked } from '@preact/signals';
import { FollowIcon, TreeIcon } from './icons.js';
import { FileTree } from './file-tree.js';
import { TreeFollow } from './follow.js';
import { TreeTypeahead } from './typeahead.js';
import { TreeMenuState } from './menu.js';
import { Prompt as PromptState, TreeOps, TreeSelection } from './state.js';
import { TREE_DEFAULTS } from './settings.js';
import { STYLE } from './style.js';
import { TINT_SCHEMA, TreeTints, type TintSource } from './tints.js';
import { Prompt } from './prompt.js';
import { Tree } from './tree.js';
import { TreeMenu } from './tree-menu.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import SearchPlugin from '@mosetta/ide-plugin-search';
import UiPlugin from '@mosetta/ide-plugin-ui';

@registry({ key: 'tree.tint', schema: TINT_SCHEMA })
@configSection({ section: 'tree', defaults: TREE_DEFAULTS })
@plugin({ title: 'plugin.tree' })
export default class TreePlugin {
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  readonly files: FileTree;
  readonly prompt = new PromptState();
  readonly selection: TreeSelection;
  readonly ops: TreeOps;
  readonly follow: TreeFollow;
  readonly typeahead: TreeTypeahead;
  readonly menu = new TreeMenuState(() => this.ide.mount.bounds());
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
    this.files = new FileTree(this.ide.tree, (message) => ide.complain(message));
    this.selection = new TreeSelection(this.files, (el) => this.ide.mount.idle(el));
    this.ops = new TreeOps(this.selection, this.prompt, this.files, ide, (path) => this.askReveal({ path }));
    this.follow = new TreeFollow(this.selection, ide);
    this.typeahead = new TreeTypeahead(this.selection, () => ide.getPlugin(SearchPlugin).layout);
    this.tints = new TreeTints(ide.registry<TintSource>('tree.tint'));
    this.shown = ide.remember('panel.tree', true);
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    effect(() => {
      this.ide.workspaces.current.value;
      this.files.reset();
    });
    effect(() => {
      if (this.ide.project.value) void this.files.load('').catch((err) => this.ide.complain(describe(err)));
    });
    this.ide.tree.onChanged((event) => this.files.refresh(event.path));

    this.ide.command('panel.tree', () => {
      if (this.shown.value && this.selection.hasKeyboard()) {
        this.shown.value = false;
        return;
      }
      this.shown.value = true;
      this.selection.focusTree();
    });

    const { selection, ops, typeahead } = this;
    this.ide.command('tree.next', () => (typeahead.term.value ? typeahead.move(1) : selection.step(1)));
    this.ide.command('tree.prev', () => (typeahead.term.value ? typeahead.move(-1) : selection.step(-1)));
    this.ide.command('tree.findClear', () => typeahead.clear());
    this.ide.command('tree.expand', () => selection.openBranch());
    this.ide.command('tree.collapse', () => selection.closeBranch());
    this.ide.command('tree.newFile', () => this.onFocused((path, isDir) => ops.create(path, isDir, 'file')));
    this.ide.command('tree.newFolder', () => this.onFocused((path, isDir) => ops.create(path, isDir, 'dir')));
    this.ide.command('tree.open', () =>
      this.onPicked((path, isDir) => {
        if (isDir) void this.files.toggle(path);
        else void this.docs.openFile(path, { focus: true });
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
        <Tree docs={this.docs} primaryHeld={(event) => this.ide.getPlugin(KeymapPlugin).primaryHeld(event)}
          typeahead={this.typeahead}
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
        <Prompt windows={this.ide.getPlugin(UiPlugin).windows} prompt={this.prompt} selection={this.selection} />
        <TreeMenu windows={this.ide.getPlugin(UiPlugin).windows} menu={this.menu} selection={this.selection} ops={this.ops} />
      </>
    ));

    effect(() => {
      const path = this.docs.openDoc.value?.path;
      if (path) untracked(() => void this.follow.now());
    });

    this.ide.mount.listen('mousedown', (event) => {
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
