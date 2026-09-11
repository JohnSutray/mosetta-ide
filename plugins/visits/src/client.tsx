import { activate, remote, stub } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { effect } from '@preact/signals';
import Editor from '@ide/plugin-editor';
import { Visits, type VisitsRemote } from './state.js';
import type { Visit } from './types.js';
import DocPlugin from '@ide/plugin-doc';

export default class VisitsPlugin implements VisitsRemote {
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  readonly visits: Visits;

  constructor(private readonly ide: Ide) {
    this.visits = new Visits(this, () => ide.getPlugin(DocPlugin));
  }

  list(): Promise<Visit[]> {
    return this.askList();
  }

  save(visits: Visit[]): Promise<unknown> {
    return this.askSave({ visits });
  }

  @remote('get') protected askList(): Promise<Visit[]> {
    return stub();
  }

  @remote('set') protected askSave(_p: { visits: Visit[] }): Promise<{ saved: number }> {
    return stub();
  }

  @activate() protected start(): void {
    const { visits } = this;
    this.ide.command('nav.back', () => visits.back());
    this.ide.command('nav.forward', () => visits.forward());

    this.ide.getPlugin(Editor).onCaret((path, line, character) => visits.visit(path, line, character));

    let last: string | null = null;
    effect(() => {
      const file = this.docs.openDoc.value;
      if (!file || file.path === last) return;
      last = file.path;
      const at = this.docs.pendingReveal.value;
      visits.visit(file.path, at?.path === file.path ? at.line : 0, at?.character ?? 0);
    });

    effect(() => {
      if (this.ide.workspaces.current.value) void visits.load();
      else visits.forget();
    });

    visits.installMouseNav();
  }
}
