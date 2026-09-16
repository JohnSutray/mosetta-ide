import { activate, command, plugin, remote, stub, type Ide } from '@mosetta/ide-api/client';
import DocPlugin from '@mosetta/ide-plugin-doc';
import GitPlugin from '@mosetta/ide-plugin-git';
import { ChangesIcon } from './icon.js';
import { ChangesPanel } from './panel.js';
import { Changes, type ChangesRemote } from './state.js';
import { STYLE } from './style.js';
import type { ShelfItem } from './server.js';

export type { ShelfItem } from './server.js';

@plugin({ title: 'plugin.changes' })
export default class ChangesPlugin implements ChangesRemote {
  readonly changes: Changes;

  constructor(private readonly ide: Ide) {
    this.changes = new Changes(
      this,
      () => ide.getPlugin(GitPlugin).snapshot,
      (text) => ide.complain(text),
      ide.remember<string>('changes.message', '', 'tab'),
      ide.remember<string[]>('changes.unpicked', [], 'tab'),
      () => ide.getPlugin(GitPlugin).refresh(),
    );
  }

  private opened(): { value: boolean } {
    this.open ??= this.ide.remember('panel.open', false);
    return this.open;
  }
  private open: { value: boolean } | null = null;

  @command('changes.commit') protected commitNow(): void {
    void this.changes.commit();
  }

  @command('panel.changes') protected toggle(): void {
    const open = this.opened();
    open.value = !open.value;
    if (open.value) void this.changes.loadShelf();
  }

  @remote('commit') commit(_ask: { message: string; files: string[]; amend?: boolean }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('shelve') shelve(_ask: { name: string; files: string[] }): Promise<{ error: string | null; item?: ShelfItem }> {
    return stub();
  }
  @remote('shelves') shelves(): Promise<ShelfItem[]> {
    return stub();
  }
  @remote('unshelve') unshelve(_ask: { id: string; keep?: boolean }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('drop') drop(_ask: { id: string }): Promise<{ error: string | null }> {
    return stub();
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const open = this.opened();
    this.changes.open.value = open.value;

    this.ide.registry('panel').add({
      id: 'changes',
      title: 'panel.changes',
      side: 'left',
      open,
      defaultWidth: 320,
      minWidth: 220,
      view: () => (
        <ChangesPanel
          changes={this.changes}
          onOpen={(path) => void this.ide.getPlugin(DocPlugin).goTo(path, 0)}
        />
      ),
      close: () => {
        open.value = false;
      },
    });

    this.ide.registry('toolbar.button').add({
      id: 'changes',
      title: 'toolbar.changes',
      command: 'panel.changes',
      icon: ChangesIcon,
      active: open,
    });
  }
}
