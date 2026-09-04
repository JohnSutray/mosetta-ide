import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { ProjectsIcon } from './icons.js';
import { ProjectsPopup } from './popup.js';
import { Projects } from './state.js';
import { STYLE } from './style.js';

export default class ProjectsPlugin {
  readonly projects = new Projects();

  constructor(private readonly ide: Ide) {}

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

    this.ide.registry<() => unknown>('chrome.top').add(() => <ProjectsPopup projects={projects} />);
  }
}
