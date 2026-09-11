import { activate, remote, stub } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { ProjectsIcon } from './icons.js';
import { ProjectsPopup } from './popup.js';
import { Projects, type ProjectsRemote } from './state.js';
import { STYLE } from './style.js';
import type { DirSuggestion, RecentProject } from './types.js';

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

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const { projects } = this;

    this.ide.command('projects.show', () => projects.toggle());
    this.ide.command('projects.next', () => projects.moveSuggestion(1));
    this.ide.command('projects.prev', () => projects.moveSuggestion(-1));
    this.ide.command('projects.suggest', () => projects.openSuggest());
    this.ide.command('projects.complete', () => projects.complete());
    this.ide.command('projects.accept', () => projects.accept());
    this.ide.command('projects.close', () => {
      if (projects.suggestOpen.peek()) projects.closeSuggest();
      else projects.hide();
    });

    this.ide.registry('toolbar.button').add({
      id: 'projects',
      title: 'toolbar.projects',
      command: 'projects.show',
      icon: (filled: boolean) => <ProjectsIcon filled={filled} />,
      active: projects.visible,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <ProjectsPopup windows={this.ide.windows} projects={projects} />);
  }
}
