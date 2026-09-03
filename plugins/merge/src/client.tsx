import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { computed } from '@preact/signals';
import { MergeIcon } from './icons.js';
import { MergeScreen } from './screen.js';
import { Merge } from './state.js';
import { STYLE } from './style.js';

export default class MergePlugin {
  readonly merge: Merge;

  constructor(private readonly ide: Ide) {
    this.merge = new Merge(ide);
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

    this.ide.registry<() => unknown>('chrome.top').add(() => <MergeScreen merge={merge} />);
  }
}
