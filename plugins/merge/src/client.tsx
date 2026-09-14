import { activate, command, plugin, remote, stub } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { computed } from '@preact/signals';
import { MergeIcon } from './icons.js';
import CodePlugin from '@mosetta/ide-plugin-code';
import { MergeScreen } from './screen.js';
import { Merge, type MergeRemote } from './state.js';
import type { MergeSession } from './types.js';

export type { MergeFile, MergeSession, MergeSide, MergeSource } from './types.js';
import { STYLE } from './style.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

@plugin({ title: 'plugin.merge' })
export default class MergePlugin implements MergeRemote {
  readonly merge: Merge;

  constructor(private readonly ide: Ide) {
    this.merge = new Merge(ide, this);
  }

  async fromDisk(path: string): Promise<MergeSession | null> {
    const session = await this.askFromDisk({ path });
    if (session) this.merge.openFor(path);
    return session;
  }

  @remote('state') state(): Promise<MergeSession | null> {
    return stub();
  }

  @remote('resolve') protected askResolve(_params: { path: string; text: string | null }): Promise<MergeSession | null> {
    return stub();
  }

  resolve(path: string, text: string | null): Promise<MergeSession | null> {
    return this.askResolve({ path, text });
  }

  @remote('cancel') protected askCancel(): Promise<null> {
    return stub();
  }

  async cancel(): Promise<void> {
    await this.askCancel();
  }

  onState(handler: (state: MergeSession | null) => void): () => void {
    return this.ide.on('state', (payload) => handler(payload as MergeSession | null));
  }

  @remote('fromDisk') protected askFromDisk(_params: { path: string }): Promise<MergeSession | null> {
    return stub();
  }

  @command('merge.show') protected show(): void { this.merge.toggle(); }
  @command('merge.nextFile') protected nextFile(): void { this.merge.stepFile(1); }
  @command('merge.prevFile') protected prevFile(): void { this.merge.stepFile(-1); }
  @command('merge.next') protected next(): void { this.merge.stepConflict(1); }
  @command('merge.prev') protected prev(): void { this.merge.stepConflict(-1); }
  @command('merge.takeLeft') protected takeLeft(): void { this.merge.decideHere('left', 'take'); }
  @command('merge.takeRight') protected takeRight(): void { this.merge.decideHere('right', 'take'); }
  @command('merge.skipLeft') protected skipLeft(): void { this.merge.decideHere('left', 'skip'); }
  @command('merge.skipRight') protected skipRight(): void { this.merge.decideHere('right', 'skip'); }
  @command('merge.confirm') protected confirm(): void { void this.merge.resolve(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('toolbar.button').add({
      id: 'merge',
      title: 'toolbar.merge',
      command: 'merge.show',
      icon: (filled: boolean) => <MergeIcon filled={filled} />,
      active: this.merge.open,
      visible: computed(() => this.merge.pending.value > 0),
      badge: this.merge.pending,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <MergeScreen windows={this.ide.getPlugin(UiPlugin).windows} merge={this.merge} code={this.ide.getPlugin(CodePlugin)} />);
  }
}
