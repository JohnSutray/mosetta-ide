import { activate, command, plugin, type Ide } from '@mosetta/ide-api/client';
import LspPlugin, { type Diagnostic } from '@mosetta/ide-plugin-lsp';
import { STYLE } from './style.js';
import { ProblemsIcon } from './icon.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import type { RevealLike } from '@mosetta/ide-plugin-lsp';

/**
 * The errors of the WHOLE project rather than of the open file.
 *
 * While only the open file was checked, the list and the panel were about the same
 * thing. Now the project is checked whole, and a panel showing one file is a shop
 * window with the rest hidden behind it.
 *
 * By file, in sections: the path as a heading, the rows beneath it. The current file
 * first — it is what gets asked about most often; the rest alphabetically, as in the
 * tree.
 *
 * The panel is only a VIEW: the diagnostics are held by a neighbour, the language
 * server plugin, and we take them through `getPlugin`. The toolbar button, the toggle
 * command and the memory of being open are set up by the plugin system from one
 * declaration.
 */
@plugin({ title: 'plugin.problems' })
export default class Problems {
  /** Documents are a neighbour: what is open, where to jump, how to edit. */
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  /**
   * How many rows we draw. A list of five thousand errors is not a list but a way to
   * hang the tab; the truncation is visible as a line.
   */
  private readonly maxRows = 500;

  constructor(private readonly ide: Ide) {}

  /**
   * Whether the panel is open — the core's memory. A lazy field rather than a local
   * inside `activate`: the command is declared by an annotation, and it may be called
   * before the plugin comes up.
   */
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

  /**
   * What raises the ceiling. The button's label is the key itself: "raise the ceiling"
   * does not say WHAT to raise, and looking for it afterwards means combing the whole
   * settings window.
   */
  private static readonly BUDGET = 'lsp.memoryBudgetMb';
  /** What the settings window will find this row by. */
  private static readonly BUDGET_KEY = 'memoryBudgetMb';

  /**
   * Who will lead to the setting. Through the registry rather than by import:
   * `getPlugin` throws if the neighbour is missing, and the problems panel would fall
   * over because somebody turned the settings off. No entry means no button, while the
   * key's name stays as text: there is still something to look for by eye.
   */
  private get opener(): RevealLike | null {
    return this.ide.registry<RevealLike>('settings.reveal').all.value[0] ?? null;
  }

  /**
   * "Not everything was checked" — where people look at it.
   *
   * The sweep is cut short by a memory budget, and until now the truncation was
   * announced as a line in the journal. The journal is read by whoever already suspects
   * something; a person opening the panel sees a list and draws the only conclusion
   * available — that this is the whole list. An empty panel lies loudest of all here:
   * "no errors" and "we did not look" look identical.
   *
   * A line for EVERY server that did not finish rather than one summary: each has its
   * own budget, and adding them up would mean naming a number that does not exist.
   */
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

  /**
   * However the sweep ended is how we explain it. One line for every case will not do:
   * "0 of 2010 checked" is equally true when the budget did not stretch to the project
   * itself and when the system cannot be measured — and those ailments are cured
   * differently.
   */
  private static readonly SAY = {
    running: 'problems.sweeping',
    budget: 'problems.partial.budget',
    baseline: 'problems.partial.baseline',
    blind: 'problems.partial.blind',
    done: 'problems.partial.budget',
  } as const;

  /** What the settings window will find the row with the server's command by. */
  private static readonly SERVERS_KEY = 'servers';
  private static readonly SERVERS = 'lsp.servers';

  /**
   * "Nobody checked" — in the same place as "not everything was checked".
   *
   * The truncation rule taught the panel to admit an INCOMPLETE sweep and left the
   * worse case unanswered: there was no sweep at all, because the server did not come
   * up. Then there is no `sweep`, the truncation line is not drawn, and the panel shows
   * "no problems" — the very lie the rule was written against, at full height.
   *
   * The case is not exotic but the FIRST one: on a fresh machine there is no language
   * server yet (`spawn typescript-language-server ENOENT`), and a human sees a clean
   * project instead of "install this".
   *
   * We stay silent where silence is truthful: `off` means a server turned off by a
   * setting, and that is said elsewhere.
   */
  private down() {
    const statuses = this.ide.getPlugin(LspPlugin).statuses.value;
    const mute = statuses.filter((one) => one.state === 'failed' || one.state === 'starting');
    if (mute.length === 0) return null;
    const opener = this.opener;

    return mute.map((status) => (
      <div class="problems-partial is-down" key={`down:${status.server}`}>
        <span>
          {status.state === 'starting'
            ? this.ide.t('problems.starting', { server: status.server })
            : this.ide.t('problems.down', { server: status.server, why: status.detail ?? '' })}
        </span>
        {status.state === 'failed' &&
          (opener ? (
            <button class="problems-raise" onClick={() => opener.reveal(Problems.SERVERS_KEY)}>
              {Problems.SERVERS}
            </button>
          ) : (
            <span class="problems-raise-key">{Problems.SERVERS}</span>
          ))}
      </div>
    ));
  }

  private view() {
    const files = this.ide.getPlugin(LspPlugin).problems.value;
    const partial = this.partial();
    const down = this.down();
    if (files.length === 0) {
      return (
        <div class="problems-list">
          {down}
          {partial}
          {!down && <div class="placeholder">{this.ide.t('problems.empty')}</div>}
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
        {down}
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

  /**
   * The jump to an error. Open the file if it is not open and place the caret — through
   * one door: a live editor is not handed to a plugin, and rightly so.
   */
  private async jump(path: string, item: Diagnostic | undefined): Promise<void> {
    if (!item) return;
    await this.docs.goTo(path, item.range.start.line, item.range.start.character);
  }
}
