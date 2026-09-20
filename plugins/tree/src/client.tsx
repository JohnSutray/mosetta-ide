import { activate, command, configSection, plugin, registry, remote, stub } from '@mosetta/ide-api/client';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import type { Ide } from '@mosetta/ide-api/client';
import { computed, effect, untracked } from '@preact/signals';
import { FollowIcon, TreeIcon } from './icons.js';
import { FileTree } from './file-tree.js';
import { TreeFollow } from './follow.js';
import { TreeMenuState } from './menu.js';
import { TreeOps, TreeSelection } from './state.js';
import { TREE_DEFAULTS , TREE_SCHEMA} from './settings.js';
import { STYLE } from './style.js';
import { TREE_ACTION_SCHEMA, type TreeAction } from './actions.js';
import { TINT_SCHEMA, TreeTints, type TintSource } from './tints.js';

import { Tree } from './tree.js';
import { TreeMenu } from './tree-menu.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import SearchPlugin from '@mosetta/ide-plugin-search';
import UiPlugin, { AskPopup, Asking, Typeahead } from '@mosetta/ide-plugin-ui';

/**
 * The project tree is a plugin.
 *
 * The core is left with two wires: one to the memory layer (`tree`: a directory's
 * contents and the "directory changed" event) and one to the OS layer (`fs`).
 * Everything else is here: the tree's MEMORY (what was read, what is expanded), the
 * selection, the arrows, the modal, the context menu, dragging, the clipboard, "follow
 * the caret".
 *
 * The panel is set up by the same three steps as everyone's: the memory is the core's,
 * the command is the core's, the shape is the layout's. The toolbar buttons are wishes.
 * The colour of a name arrives from neighbours through the `tree.tint` key, and the key
 * is declared by THE TREE: whoever reads knows the shape.
 */
@registry({ key: 'tree.tint', schema: TINT_SCHEMA })
@registry({ key: 'tree.action', schema: TREE_ACTION_SCHEMA })
@configSection({ section: 'tree', defaults: TREE_DEFAULTS, schema: TREE_SCHEMA })
@plugin({ title: 'plugin.tree' })
export default class TreePlugin {
  /** Documents are a neighbour: what is open, where to jump, how to edit. */
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  readonly files: FileTree;
  /** The question modal is a shared widget: the changes panel asks it too. */
  readonly prompt = new Asking();
  readonly selection: TreeSelection;
  readonly ops: TreeOps;
  readonly follow: TreeFollow;
  /**
   * Type-ahead search is a shared widget: lists are searched both here and in the
   * changes.
   */
  readonly typeahead: Typeahead;
  readonly menu = new TreeMenuState(() => this.ide.mount.bounds());
  readonly tints: TreeTints;
  /** Whether the panel is open — remembered across reloads. */
  readonly shown;

  /**
   * Paths holding a broken file inside: the file itself and every directory above it.
   * Computed from the core's diagnostics here rather than there: "an error rises
   * through the directories" is a rule about showing the tree rather than about the
   * language layer.
   */
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
    this.typeahead = new Typeahead(
      {
        order: () => this.selection.visibleOrder(),
        current: () => this.selection.focus.value,
        go: (path) => this.selection.only(path),
        nameOf: (path) => path.slice(path.lastIndexOf('/') + 1),
      },
      () => ide.getPlugin(SearchPlugin).layout,
    );
    this.tints = new TreeTints(ide.registry<TintSource>('tree.tint'));
    this.shown = ide.remember('panel.tree', true);
  }

  @command('panel.tree')
  protected togglePanel(): void {
    if (this.shown.value && this.selection.hasKeyboard()) {
      this.shown.value = false;
      return;
    }
    this.shown.value = true;
    this.selection.focusTree();
  }

  @command('tree.next')
  protected next(): void { if (this.typeahead.term.value) this.typeahead.move(1); else this.selection.step(1); }
  @command('tree.prev')
  protected prev(): void { if (this.typeahead.term.value) this.typeahead.move(-1); else this.selection.step(-1); }
  @command('tree.findClear') protected findClear(): void { this.typeahead.clear(); }
  @command('tree.expand') protected expand(): void { this.selection.openBranch(); }
  @command('tree.collapse') protected collapse(): void { this.selection.closeBranch(); }
  @command('tree.newFile')
  protected newFile(): void { this.onFocused((path, isDir) => this.ops.create(path, isDir, 'file')); }
  @command('tree.newFolder')
  protected newFolder(): void { this.onFocused((path, isDir) => this.ops.create(path, isDir, 'dir')); }

  @command('tree.open')
  protected openRow(): void {
    this.onPicked((path, isDir) => {
      if (isDir) void this.files.toggle(path);
      else void this.docs.openFile(path, { focus: true });
    });
  }

  @command('tree.rename') protected rename(): void { this.onPicked((path) => this.ops.rename(path)); }
  @command('tree.delete') protected remove(): void { this.onPicked((path, isDir) => this.ops.remove(path, isDir)); }
  @command('tree.copy') protected copy(): void { this.onPicked((path) => this.ops.copy(path, false)); }
  @command('tree.cut') protected cut(): void { this.onPicked((path) => this.ops.copy(path, true)); }
  @command('tree.paste') protected paste(): void { this.onFocused((path, isDir) => void this.ops.pasteInto(path, isDir)); }
  @command('tree.copyPath') protected copyPath(): void { this.onPicked((path) => void this.ops.copyAbsolutePath(path)); }
  @command('tree.reveal') protected reveal(): void { this.onPicked((path) => void this.ops.revealInOs(path)); }
  @command('tree.follow') protected followEditor(): void { void this.follow.toggle(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    let seenRoot: string | null = null;
    effect(() => {
      const root = this.ide.workspaces.current.value?.root ?? null;
      if (root === seenRoot) return;
      seenRoot = root;
      this.files.reset();
    });
    effect(() => {
      if (this.ide.project.value) void this.files.load('').catch((err) => this.ide.complain(describe(err)));
    });
    this.ide.tree.onChanged((event) => this.files.refresh(event.path));

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
        <AskPopup
          windows={this.ide.getPlugin(UiPlugin).windows}
          asking={this.prompt}
          onClosed={() => this.selection.takeKeyboard()}
        />
        <TreeMenu
          windows={this.ide.getPlugin(UiPlugin).windows}
          menu={this.menu}
          selection={this.selection}
          ops={this.ops}
          actions={this.ide.registry<TreeAction>('tree.action').all.value}
        />
      </>
    ));

    effect(() => {
      const path = this.docs.openDoc.value?.path;
      if (path) untracked(() => void this.follow.now());
    });
  }

  /** Reveal in the OS file manager — the tree's server half. */
  @remote('reveal') protected askReveal(_params: { path: string }): Promise<void> {
    return stub();
  }

  /**
   * Call an action for the row the tree's focus is on. Nothing selected means we work
   * with the root: "new file" with no selection means "create in the project".
   */
  private onFocused(run: (path: string, isDir: boolean) => void): void {
    const path = this.selection.focus.value ?? '';
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    const entry = this.files.children.value.get(parent)?.find((item) => item.path === path);
    run(path, path === '' ? true : entry?.kind === 'dir');
  }

  /**
   * The same, but for actions on a PARTICULAR file: delete, rename, open. Without a
   * selection they do nothing — substituting the project root here is not on. "Delete"
   * with no selection once offered to delete the whole project, and offered
   * convincingly.
   */
  private onPicked(run: (path: string, isDir: boolean) => void): void {
    const path = this.selection.focus.value;
    if (!path) return;
    this.onFocused(run);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
