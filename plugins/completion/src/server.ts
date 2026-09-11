import { command, type CallContext, type Ide } from '@mosetta/ide-api/server';
import { ChoiceStore } from './choice-store.js';

export default class CompletionServer {
  private readonly store: ChoiceStore;

  constructor(private readonly ide: Ide) {
    this.store = new ChoiceStore(() => this.ide.state);
  }

  @command() protected choices(): Promise<Record<string, number>> {
    return this.store.load();
  }

  @command() protected async chose(params: unknown, call: CallContext): Promise<{ label: string; times: number }> {
    const label = (params as { label?: unknown } | null)?.label;
    if (typeof label !== 'string' || label === '') throw new Error('нужен label: string');
    const times = await this.store.add(label);
    call.project.emit('chose', { label, times });
    return { label, times };
  }
}
