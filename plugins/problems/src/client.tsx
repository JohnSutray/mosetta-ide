import { activate, command, plugin, type Ide } from '@mosetta/ide-api/client';
import LspPlugin, { type Diagnostic } from '@mosetta/ide-plugin-lsp';
import { STYLE } from './style.js';
import { ProblemsIcon } from './icon.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import type { RevealLike } from '@mosetta/ide-plugin-lsp';

@plugin({ title: 'plugin.problems' })
export default class Problems {
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  private readonly maxRows = 500;

  constructor(private readonly ide: Ide) {}

  private open: { value: boolean } | null = null;
  private opened(): { value: boolean } {
    this.open ??= this.ide.remember('panel.open', false);
    return this.open;
  }

  @command('panel.problems')
  protected toggle(): void {
    const open = this.opened();
    open.value = !open.value;
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const open = this.opened();

    this.ide.registry('panel').add({
      id: 'problems',
      title: 'panel.problems',
      side: 'right',
      open,
      defaultWidth: 360,
      minWidth: 200,
      view: () => this.view(),
      close: () => {
        open.value = false;
      },
    });

    this.ide.registry('toolbar.button').add({
      id: 'problems',
      title: 'toolbar.problems',
      command: 'panel.problems',
      icon: ProblemsIcon,
      active: open,
    });
  }

  private static readonly BUDGET = 'lsp.memoryBudgetMb';
  private static readonly BUDGET_KEY = 'memoryBudgetMb';

  private get opener(): RevealLike | null {
    return this.ide.registry<RevealLike>('settings.reveal').all.value[0] ?? null;
  }

  private partial() {
    const statuses = this.ide.getPlugin(LspPlugin).statuses.value;
    const unfinished = statuses.filter((one) => one.sweep && one.sweep.checked < one.sweep.total);
    if (unfinished.length === 0) return null;
    const opener = this.opener;

    return unfinished.map((status) => {
      const sweep = status.sweep!;
      return (
        <div class="problems-partial" key={status.server}>
          <span>
            {statuses.length > 1 ? `${status.server}: ` : ''}
            {this.ide.t(Problems.SAY[sweep.stopped ?? 'running'], {
              checked: sweep.checked,
              total: sweep.total,
              mb: sweep.mb ?? 0,
              budget: sweep.budgetMb,
            })}
          </span>
          {opener ? (
            <button class="problems-raise" onClick={() => opener.reveal(Problems.BUDGET_KEY)}>
              {Problems.BUDGET}
            </button>
          ) : (
            <span class="problems-raise-key">{Problems.BUDGET}</span>
          )}
        </div>
      );
    });
  }

  private static readonly SAY = {
    running: 'problems.sweeping',
    budget: 'problems.partial.budget',
    baseline: 'problems.partial.baseline',
    blind: 'problems.partial.blind',
    done: 'problems.partial.budget',
  } as const;

  private view() {
    const files = this.ide.getPlugin(LspPlugin).problems.value;
    const partial = this.partial();
    if (files.length === 0) {
      return (
        <div class="problems-list">
          {partial}
          <div class="placeholder">{this.ide.t('problems.empty')}</div>
        </div>
      );
    }

    let left = this.maxRows;
    const shown: Array<{ path: string; diagnostics: Diagnostic[] }> = [];
    for (const file of files) {
      if (left <= 0) break;
      shown.push({ path: file.path, diagnostics: file.diagnostics.slice(0, left) });
      left -= file.diagnostics.length;
    }
    const total = files.reduce((sum, file) => sum + file.diagnostics.length, 0);
    const cut = total - shown.reduce((sum, file) => sum + file.diagnostics.length, 0);

    return (
      <div class="problems-list">
        {partial}
        {shown.map((file) => (
          <div class="problems-file" key={file.path}>
            <div
              class={`problems-where ${this.docs.openDoc.value?.path === file.path ? 'is-current' : ''}`}
              title={file.path}
              onClick={() => void this.jump(file.path, file.diagnostics[0])}
            >
              <span class="problems-path">{file.path}</span>
              <span class="problems-count">{file.diagnostics.length}</span>
            </div>
            <ul class="problems">
              {file.diagnostics.map((item, i) => (
                <li
                  key={`${item.range.start.line}:${i}`}
                  class={`problem is-${item.severity}`}
                  onClick={() => void this.jump(file.path, item)}
                >
                  <span class="problem-where">
                    {item.range.start.line + 1}:{item.range.start.character + 1}
                  </span>
                  <span class="problem-what">{item.message}</span>
                  {item.code !== undefined && <span class="problem-code">TS{item.code}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {cut > 0 && <div class="problems-more">{this.ide.t('problems.more', { count: cut })}</div>}
      </div>
    );
  }

  private async jump(path: string, item: Diagnostic | undefined): Promise<void> {
    if (!item) return;
    await this.docs.goTo(path, item.range.start.line, item.range.start.character);
  }
}
