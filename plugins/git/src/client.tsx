import { computed, effect, type ReadonlySignal } from '@preact/signals';
import { activate, command, configSection, plugin, remote, stub, type Ide } from '@mosetta/ide-api/client';
import Editor from '@mosetta/ide-plugin-editor';
import { BranchesWindow, Git, PushWindow, type GitRemote, type TreeTint } from './state.js';
import { GitMarks } from './marks.js';
import { Branches } from './branches.js';
import { Push } from './push.js';
import { HunkPopup } from './hunk-popup.js';
import { BranchIcon, PushIcon } from './icons.js';
import { GIT_DEFAULTS , GIT_SCHEMA} from './settings.js';
import { STYLE } from './style.js';
import type {
  GitAction,
  GitBranch,
  GitChange,
  GitFileState,
  GitState,
  PushPreview,
} from './types.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * git on the client is a plugin.
 *
 * The IDE's second AXIS with a source of truth of its own left the core entirely: the
 * core knows neither what a branch is nor what colour a changed file is. What it lends
 * it — the project, the document and the neighbouring editor — was in the contract
 * before git, or appeared for git's sake by name.
 *
 * The three state classes (`Git`, `BranchesWindow`, `PushWindow`) are the same ones
 * that were in the core; only where they get their services from has changed — through
 * the constructor from the plugin rather than by import from a module.
 *
 * There are three seams outwards, and all three go through neighbours rather than
 * through the core:
 *
 * * the tree's colour: we write into the `tree.tint` registry, and the tree reads;
 * * the strips in the editor: we bring the editor the commit's version and take a click on a strip back from it;
 * * the branch in the toolbar and two buttons: wishes, like everyone's.
 */
@configSection({ section: 'git', defaults: GIT_DEFAULTS, schema: GIT_SCHEMA })
@plugin({ title: 'plugin.git' })
export default class GitPlugin implements GitRemote {
  /** Documents are a neighbour: what is open, where to jump, how to edit. */
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  private readonly git: Git;
  private readonly branchesWindow: BranchesWindow;
  private readonly pushWindow: PushWindow;
  private readonly marks: GitMarks;

  constructor(private readonly ide: Ide) {
    this.git = new Git(this, ide);
    this.branchesWindow = new BranchesWindow(this.git, ide, () => ide.getPlugin(UiPlugin).fuzzy);
    this.pushWindow = new PushWindow(this.git, this, ide);
    this.marks = new GitMarks(this, () => ide.getPlugin(DocPlugin));
  }

  @command('git.branches')
  protected toggleBranches(): void {
    if (this.branchesWindow.open.value) this.branchesWindow.close();
    else this.branchesWindow.show();
  }

  @command('git.push')
  protected push(): void {
    if (this.pushWindow.open.value) this.pushWindow.close();
    else void this.pushWindow.show();
  }

  @command('git.fetch')
  protected fetchRemote(): void { void this.branchesWindow.do('fetch'); }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    this.ide.registry('toolbar.button').add({
      id: 'git.branches',
      title: 'toolbar.branches',
      command: 'git.branches',
      icon: BranchIcon,
      active: this.branchesWindow.open,
    });
    this.ide.registry('toolbar.button').add({
      id: 'git.push',
      title: 'toolbar.push',
      command: 'git.push',
      icon: PushIcon,
      active: this.pushWindow.open,
    });
    this.ide.registry('toolbar.widget').add({
      id: 'branch',
      side: 'right',
      chip: () => this.branchChip(),
    });

    this.ide.registry('tree.tint').add({ id: 'git', tint: this.git.tint });

    this.ide.surface(() => (
      <Branches windows={this.ide.getPlugin(UiPlugin).windows} git={this.git} window={this.branchesWindow} push={this.pushWindow} />
    ));
    this.ide.surface(() => <Push windows={this.ide.getPlugin(UiPlugin).windows} git={this.git} push={this.pushWindow} />);
    this.ide.surface(() => <HunkPopup docs={this.docs} windows={this.ide.getPlugin(UiPlugin).windows} marks={this.marks} />);

    const editor = this.ide.getPlugin(Editor);
    editor.onHunk((hunk, box) => this.marks.show(hunk, box));
    effect(() => {
      const head = this.marks.head.value;
      if (head) editor.setHead(head.path, head.text);
    });

    effect(() => {
      const path = this.docs.openDoc.value?.path ?? null;
      void this.git.state.value;
      void this.marks.load(this.ide.project.value ? path : null);
    });

    effect(() => {
      const current = this.ide.project.value;
      this.git.reset();
      this.branchesWindow.reset();
      if (current) void this.git.refresh();
    });
  }

  /** A snapshot of the repository: the branch, how far behind, the files' states. */
  get snapshot(): ReadonlySignal<GitState> {
    return this.git.state;
  }

  /**
   * Recount the snapshot NOW.
   *
   * Normally memory recounts it: a file was saved, moved, vanished. But a commit does
   * not touch files — only the history changes — and without this request the change
   * list would stay complete right after being committed. Whoever knows what they did
   * asks.
   */
  refresh(): Promise<void> {
    return this.git.refresh();
  }

  @remote('state') state(): Promise<GitState> {
    return stub();
  }
  @remote('branches') branches(): Promise<GitBranch[]> {
    return stub();
  }
  @remote('outgoing') outgoing(): Promise<PushPreview> {
    return stub();
  }
  @remote('changes') askChanges(_p: { commit?: string }): Promise<GitChange[]> {
    return stub();
  }
  @remote('run') askRun(_p: { action: GitAction; branch?: string; name?: string }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('head') protected askHead(_p: { path: string }): Promise<{ path: string; text: string | null }> {
    return stub();
  }

  head(path: string): Promise<{ path: string; text: string | null }> {
    return this.askHead({ path });
  }
  changes(commit?: string): Promise<GitChange[]> {
    return this.askChanges(commit ? { commit } : {});
  }
  run(action: GitAction, branch?: string, name?: string): Promise<{ error: string | null }> {
    return this.askRun({ action, ...(branch ? { branch } : {}), ...(name ? { name } : {}) });
  }

  /**
   * The branch is not a caption but a button: it is the first thing asked about and
   * changed.
   *
   * The badge is drawn by the toolbar from a description: the same form, the same size
   * and the same colour as the shell, the package manager and the memory beside it.
   * Ours was written in the text colour rather than the muted one, and in a row of
   * identical things it looked like a thing of another kind — while the kind is one.
   */
  private branchChip() {
    if (!this.ide.project.value) return null;
    const state = this.git.state.value;
    const name = state.repo ? (state.branch ?? this.ide.t('toolbar.noBranch')) : this.ide.t('toolbar.noRepo');
    return {
      icon: <BranchIcon />,
      tip: this.ide.t(state.repo ? 'git.branch.about' : 'git.branch.aboutNoRepo', {
        branch: name,
        ahead: state.ahead,
        behind: state.behind,
      }),
      keys: this.ide.getPlugin(KeymapPlugin).keysFor('git.branches'),
      text: (
        <>
          {name}
          {state.ahead > 0 && <span class="branch-ahead">↑{state.ahead}</span>}
          {state.behind > 0 && <span class="branch-behind">↓{state.behind}</span>}
        </>
      ),
      onClick: () => this.ide.runCommand('git.branches'),
    };
  }
}

export type { GitFileState, GitState, TreeTint };
void computed;
