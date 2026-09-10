import { activate, remote, stub } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { computed } from '@preact/signals';
import { MergeIcon } from './icons.js';
import CodePlugin from '@ide/plugin-code';
import { MergeScreen } from './screen.js';
import { Merge, type MergeRemote } from './state.js';
import type { MergeSession } from './types.js';

export type { MergeFile, MergeSession, MergeSide, MergeSource } from './types.js';
import { STYLE } from './style.js';

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

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const { merge } = this;

    this.ide.command('merge.show', () => merge.toggle());
    this.ide.command('merge.nextFile', () => merge.stepFile(1));
    this.ide.command('merge.prevFile', () => merge.stepFile(-1));
    this.ide.command('merge.next', () => merge.stepConflict(1));
    this.ide.command('merge.prev', () => merge.stepConflict(-1));
    this.ide.command('merge.takeLeft', () => merge.decideHere('left', 'take'));
    this.ide.command('merge.takeRight', () => merge.decideHere('right', 'take'));
    this.ide.command('merge.skipLeft', () => merge.decideHere('left', 'skip'));
    this.ide.command('merge.skipRight', () => merge.decideHere('right', 'skip'));
    this.ide.command('merge.confirm', () => void merge.resolve());

    this.ide.registry('toolbar.button').add({
      id: 'merge',
      title: 'toolbar.merge',
      command: 'merge.show',
      icon: (filled: boolean) => <MergeIcon filled={filled} />,
      active: merge.open,
      visible: computed(() => merge.pending.value > 0),
      badge: merge.pending,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <MergeScreen windows={this.ide.windows} merge={merge} code={this.ide.getPlugin(CodePlugin)} />);
  }
}
