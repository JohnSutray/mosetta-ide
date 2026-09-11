import { computed, effect, type ReadonlySignal } from '@preact/signals';
import { activate, configSection, remote, stub, type Ide } from '@ide/api/client';
import Editor from '@ide/plugin-editor';
import { BranchesWindow, Git, PushWindow, type GitRemote, type TreeTint } from './state.js';
import { GitMarks } from './marks.js';
import { Branches } from './branches.js';
import { Push } from './push.js';
import { HunkPopup } from './hunk-popup.js';
import { BranchIcon, PushIcon } from './icons.js';
import { GIT_DEFAULTS } from './settings.js';
import { STYLE } from './style.js';
import type {
  GitAction,
  GitBranch,
  GitChange,
  GitFileState,
  GitState,
  PushPreview,
} from './types.js';
import DocPlugin from '@ide/plugin-doc';
import KeymapPlugin from '@ide/plugin-keymap';
import UiPlugin from '@ide/ui';

@configSection({ section: 'git', defaults: GIT_DEFAULTS })
export default class GitPlugin implements GitRemote {
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

  @activate() protected start(): void {
    this.ide.css(STYLE);

    this.ide.command('git.branches', () =>
      this.branchesWindow.open.value ? this.branchesWindow.close() : this.branchesWindow.show(),
    );
    this.ide.command('git.push', () =>
      this.pushWindow.open.value ? this.pushWindow.close() : void this.pushWindow.show(),
    );
    this.ide.command('git.fetch', () => void this.branchesWindow.do('fetch'));

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
      view: () => this.branchLabel(),
    });

    this.ide.registry('tree.tint').add({ id: 'git', tint: this.git.tint });

    this.ide.surface(() => (
      <Branches windows={this.ide.windows} git={this.git} window={this.branchesWindow} push={this.pushWindow} />
    ));
    this.ide.surface(() => <Push windows={this.ide.windows} git={this.git} push={this.pushWindow} />);
    this.ide.surface(() => <HunkPopup docs={this.docs} windows={this.ide.windows} marks={this.marks} />);

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

  get snapshot(): ReadonlySignal<GitState> {
    return this.git.state;
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

  private branchLabel() {
    if (!this.ide.project.value) return null;
    const state = this.git.state.value;
    return (
      <button
        class="branch-label"
        onMouseEnter={(event) =>
          this.ide.windows.tips.show(event.currentTarget as Element, this.ide.t('toolbar.branches'), this.ide.getPlugin(KeymapPlugin).keysFor('git.branches'))
        }
        onMouseLeave={() => this.ide.windows.tips.hide()}
        onClick={() => {
          this.ide.windows.tips.hide();
          this.ide.runCommand('git.branches');
        }}
      >
        {state.repo ? (state.branch ?? this.ide.t('toolbar.noBranch')) : this.ide.t('toolbar.noRepo')}
        {state.ahead > 0 && <span class="branch-ahead">↑{state.ahead}</span>}
        {state.behind > 0 && <span class="branch-behind">↓{state.behind}</span>}
      </button>
    );
  }
}

export type { GitFileState, TreeTint };
void computed;
