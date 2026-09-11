import { activate, type Ide } from '@mosetta/ide-api/client';
import LspPlugin, { type Diagnostic } from '@mosetta/ide-plugin-lsp';
import { STYLE } from './style.js';
import { ProblemsIcon } from './icon.js';
import DocPlugin from '@mosetta/ide-plugin-doc';

export default class Problems {
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  private readonly maxRows = 500;

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const open = this.ide.remember('panel.open', false);
    this.ide.command('panel.problems', () => {
      open.value = !open.value;
    });

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

  private view() {
    const files = this.ide.getPlugin(LspPlugin).problems.value;
    if (files.length === 0) {
      return <div class="placeholder">{this.ide.t('problems.empty')}</div>;
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
