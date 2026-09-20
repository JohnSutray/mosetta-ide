import { activate, command, plugin, remote, stub } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { ProjectsIcon } from './icons.js';
import { ProjectsPopup } from './popup.js';
import { Projects, type ProjectsRemote } from './state.js';
import { STYLE } from './style.js';
import type { DirSuggestion, RecentProject } from './types.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * The project picker is a plugin.
 *
 * Opening a project is the core's job (reset everything project-scoped, attach the
 * socket, remember it in the address), and the core does it: the contract hands over
 * `workspaces`. Here is the window one chooses in: the history, the path field, the
 * directory tree, the suggestions on Cmd+Space, and the rule "while there is no
 * project, the picker is open by itself". The machine's directories and the history
 * belong to its own server half rather than to the core.
 */
@plugin({ title: 'plugin.projects' })
export default class ProjectsPlugin implements ProjectsRemote {
  readonly projects: Projects;

  constructor(private readonly ide: Ide) {
    this.projects = new Projects(this, ide.workspaces);
  }

  @remote() roots(): Promise<DirSuggestion[]> {
    return stub();
  }

  @remote() recent(): Promise<RecentProject[]> {
    return stub();
  }

  @remote('browse') protected askBrowse(_params: {
    prefix: string;
    depth?: number;
    limit?: number;
  }): Promise<DirSuggestion[]> {
    return stub();
  }

  browse(prefix: string, options?: { depth?: number; limit?: number }): Promise<DirSuggestion[]> {
    return this.askBrowse({ prefix, ...options });
  }

  @remote() remember(): Promise<void> {
    return stub();
  }

  @command('projects.show') protected show(): void { this.projects.toggle(); }
  @command('projects.next') protected next(): void { this.projects.moveSuggestion(1); }
  @command('projects.prev') protected prev(): void { this.projects.moveSuggestion(-1); }
  @command('projects.suggest') protected suggest(): void { this.projects.openSuggest(); }
  @command('projects.complete') protected complete(): void { this.projects.complete(); }
  @command('projects.accept') protected accept(): void { this.projects.accept(); }

  @command('projects.close')
  protected close(): void {
    if (this.projects.suggestOpen.peek()) this.projects.closeSuggest();
    else this.projects.hide();
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('toolbar.button').add({
      id: 'projects',
      title: 'toolbar.projects',
      command: 'projects.show',
      icon: (filled: boolean) => <ProjectsIcon filled={filled} />,
      active: this.projects.visible,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <ProjectsPopup windows={this.ide.getPlugin(UiPlugin).windows} projects={this.projects} />);
  }
}
