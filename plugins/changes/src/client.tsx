import { activate, command, configSection, plugin, remote, stub, type Ide } from '@mosetta/ide-api/client';
import CodePlugin from '@mosetta/ide-plugin-code';
import DocPlugin from '@mosetta/ide-plugin-doc';
import GitPlugin from '@mosetta/ide-plugin-git';
import SearchPlugin from '@mosetta/ide-plugin-search';
import UiPlugin, { AskPopup, Asking, Menu, ModeSwitch, Typeahead, type MenuItem } from '@mosetta/ide-plugin-ui';
import { Diff } from './diff.js';
import { DiffView } from './diff-view.js';
import { ChangesIcon, SplitIcon, UnifiedIcon } from './icon.js';
import { PatchReader } from './patch.js';
import { ChangesPanel } from './panel.js';
import { CHANGES_DEFAULTS, CHANGES_SCHEMA, type DiffMode } from './settings.js';
import { RESERVED, UNRESOLVED_LIST, Changes, type ChangesRemote } from './state.js';
import type { Changelist } from './changelist.js';
import { STYLE } from './style.js';
import type { ShelfItem } from './server.js';
import { computed, effect, signal } from '@preact/signals';

export type { ShelfItem } from './server.js';

@configSection({
  section: 'changes',
  defaults: CHANGES_DEFAULTS,
  schema: CHANGES_SCHEMA,
  fields: { diffMode: { options: ['split', 'unified'] } },
})
@plugin({ title: 'plugin.changes' })
export default class ChangesPlugin implements ChangesRemote {
  readonly changes: Changes;
  readonly diff: Diff;
  private readonly patches = new PatchReader();
  private readonly asking = new Asking();
  private readonly menu = signal<{ x: number; y: number; items: MenuItem[] } | null>(null);
  private readonly find: Typeahead;
  private saving: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ide: Ide) {
    this.changes = new Changes(
      this,
      () => ide.getPlugin(GitPlugin).snapshot,
      (text) => ide.complain(text),
      signal(''),
      ide.remember<string[]>('changes.unpicked', [], 'tab'),
      ide.remember<string[]>('changes.folded', [], 'tab'),
      () => ide.getPlugin(GitPlugin).refresh(),
    );
    this.diff = new Diff(
      (path) => ide.getPlugin(GitPlugin).head(path),
      (path) => ide.getPlugin(DocPlugin).peekFile(path),
      (a, b) => ide.getPlugin(CodePlugin).diff.steps(a, b),
      (text) => ide.getPlugin(CodePlugin).diff.split(text),
    );
    this.find = new Typeahead(
      {
        order: () => this.changes.visibleOrder(),
        current: () => this.changes.focus.value,
        go: (path) => this.changes.only(path),
        nameOf: (path) => path.slice(path.lastIndexOf('/') + 1),
      },
      () => ide.getPlugin(SearchPlugin).layout,
    );
  }

  private mode(): DiffMode {
    return this.ide.settingsOf('changes', CHANGES_DEFAULTS).value.diffMode;
  }

  private opened(): { value: boolean } {
    this.open ??= this.ide.remember('panel.open', false);
    return this.open;
  }
  private open: { value: boolean } | null = null;

  @command('changes.commit') protected commitNow(): void {
    void this.changes.commit();
  }

  @command('changes.diffClose') protected closeDiff(): void {
    this.diff.close();
  }

  @command('changes.openFile') protected openPicked(): void {
    const path = this.diff.open.value ? this.diff.path.value : (this.changes.targets()[0] ?? null);
    if (path) this.openFile(path);
  }

  @command('changes.next') protected next(): void {
    if (this.find.term.value) this.find.move(1);
    else this.changes.step(1);
  }
  @command('changes.prev') protected prev(): void {
    if (this.find.term.value) this.find.move(-1);
    else this.changes.step(-1);
  }
  @command('changes.showDiff') protected showPicked(): void {
    const path = this.changes.focus.value;
    const row = this.changes.rows.value.find((one) => one.path === path);
    if (row) void this.diff.show(row.path, row.state === 'deleted' ? 'deleted' : 'other', row.from);
  }
  @command('changes.escape') protected escape(): void {
    if (this.find.term.value !== '') {
      this.find.clear();
      return;
    }
    this.diff.close();
  }

  @command('panel.changes') protected toggle(): void {
    const open = this.opened();
    open.value = !open.value;
    if (open.value) void this.changes.loadShelf();
  }

  private openFile(path: string): void {
    this.diff.close();
    void this.ide.getPlugin(DocPlugin).goTo(path, 0);
  }

  private modeSwitch() {
    return (
      <ModeSwitch
        windows={this.ide.getPlugin(UiPlugin).windows}
        value={this.mode()}
        options={[
          { id: 'split' as DiffMode, icon: <SplitIcon />, tip: this.ide.t('changes.diffMode.split') },
          { id: 'unified' as DiffMode, icon: <UnifiedIcon />, tip: this.ide.t('changes.diffMode.unified') },
        ]}
        onPick={(id) => void this.ide.setSetting('changes', 'diffMode', id)}
      />
    );
  }

  private rowMenu(list: Changelist | null): MenuItem[] {
    const files = list ? this.filesOf(list) : this.changes.targets();
    const lists = this.changes.lists.value;
    const items: MenuItem[] = [];

    if (!list && files.length > 0) {
      items.push({ label: 'changes.menu.open', run: () => this.openFile(files[0]!) });
    }

    if (files.length > 0) {
      items.push({ label: 'changes.menu.shelve', run: () => this.askShelve(files) });
      const here = list ? [list.id] : this.listsOf(files);
      for (const one of lists) {
        if (one.id === UNRESOLVED_LIST) continue;
        if (here.length === 1 && here[0] === one.id) continue;
        items.push({
          label: 'changes.menu.moveTo',
          args: { name: one.name },
          run: () => void this.changes.moveTo(one.id, files),
        });
      }
      items.push({ label: 'changes.menu.moveNew', run: () => this.askList(files) });
      items.push({ label: 'changes.menu.rollback', danger: true, run: () => this.askRollback(files) });
    }

    if (list && !RESERVED.includes(list.id)) {
      items.push({ label: 'changes.menu.renameList', run: () => this.askRenameList(list) });
      items.push({ label: 'changes.menu.removeList', danger: true, run: () => void this.changes.removeList(list.id) });
    }
    if (files.length === 0 || list) items.push({ label: 'changes.menu.newList', run: () => this.askList([]) });
    return items;
  }

  private filesOf(list: Changelist): string[] {
    return this.changes.groups.value.find((group) => group.list.id === list.id)?.rows.map((row) => row.path) ?? [];
  }

  private listsOf(files: string[]): string[] {
    const groups = this.changes.groups.value;
    const where = new Set<string>();
    for (const group of groups) {
      if (group.rows.some((row) => files.includes(row.path))) where.add(group.list.id);
    }
    return [...where];
  }

  private shelfMenu(item: ShelfItem): MenuItem[] {
    return [
      { label: 'changes.menu.unshelve', run: () => void this.changes.unshelve(item.id) },
      { label: 'changes.menu.renameShelf', run: () => this.askRenameShelf(item) },
      { label: 'changes.menu.dropShelf', danger: true, run: () => void this.changes.drop(item.id) },
    ];
  }

  private askShelve(files: string[]): void {
    this.asking.show({
      title: this.ide.t('changes.ask.shelveTitle'),
      text: this.ide.t('changes.ask.files', { count: files.length }),
      field: true,
      value: this.changes.message.value.split('\n')[0] ?? '',
      confirm: this.ide.t('changes.shelve'),
      run: async (name) => {
        await this.changes.shelve(name, files);
      },
    });
  }

  private askList(files: string[]): void {
    this.asking.show({
      title: this.ide.t('changes.ask.listTitle'),
      field: true,
      value: '',
      confirm: this.ide.t('changes.ask.create'),
      run: async (name) => {
        const made = await this.changes.createList(name);
        if (files.length > 0) await this.changes.moveTo(made.id, files);
      },
    });
  }

  private askRenameList(list: Changelist): void {
    this.asking.show({
      title: this.ide.t('changes.ask.renameListTitle'),
      field: true,
      value: list.name,
      confirm: this.ide.t('changes.ask.rename'),
      run: async (name) => {
        await this.changes.renameList(list.id, name);
      },
    });
  }

  private askRenameShelf(item: ShelfItem): void {
    this.asking.show({
      title: this.ide.t('changes.ask.renameShelfTitle'),
      field: true,
      value: item.name,
      confirm: this.ide.t('changes.ask.rename'),
      run: async (name) => {
        await this.changes.renameShelf(item.id, name);
      },
    });
  }

  private askRollback(files: string[]): void {
    this.asking.show({
      title: this.ide.t('changes.ask.rollbackTitle'),
      text: files.join('\n'),
      field: false,
      danger: true,
      confirm: this.ide.t('changes.ask.rollback'),
      run: async () => {
        await this.changes.revert(files);
      },
    });
  }

  private async showShelved(item: ShelfItem, path: string): Promise<void> {
    const from = item.name === path ? this.ide.t('changes.diffFromShelfPlain') : this.ide.t('changes.diffFromShelf', { name: item.name });
    try {
      const file = this.patches.read((await this.changes.patchOf(item.id)).text).find((one) => one.path === path);
      if (!file) return this.diff.failed(path, this.ide.t('changes.diffNoFile'), from);
      if (file.binary) return this.diff.failed(path, this.ide.t('changes.diffBinary'), from);
      const head = (await this.ide.getPlugin(GitPlugin).head(path)).text ?? '';
      const onHead = this.patches.apply(head, file.hunks);
      if (onHead !== null) return this.diff.showShelved(path, head, onHead, from);
      const base = (await this.changes.baseOf(item.id, path)).text;
      if (base === null) return this.diff.failed(path, this.ide.t('changes.diffNoBase'), from);
      const onBase = this.patches.apply(base, file.hunks);
      if (onBase === null) return this.diff.failed(path, this.ide.t('changes.diffBroken'), from);
      this.diff.showShelved(path, base, onBase, `${from}  ${this.ide.t('changes.diffOnBase')}`);
    } catch (err) {
      this.diff.failed(path, err instanceof Error ? err.message : String(err), from);
    }
  }

  private async revertHunk(hunk: number): Promise<void> {
    const path = this.diff.path.value;
    if (!path) return;
    const text = this.diff.revertedText(hunk);
    if (text === null) return;
    const docs = this.ide.getPlugin(DocPlugin);
    if (docs.openDoc.value?.path === path) {
      docs.replaceText(text);
      await docs.flushDocs();
    } else if (!(await this.changes.writeFile(path, text))) return;
    await this.diff.show(path);
    await this.ide.getPlugin(GitPlugin).refresh();
  }

  private diffHeading(): string | null {
    const path = this.diff.path.value;
    if (!path) return null;
    const from = this.diff.from.value;
    const where = from === '' ? '' : `  ${from}`;
    if (this.diff.busy.value || this.diff.error.value !== '') return `${path}${where}`;
    const { added, removed } = this.diff.count();
    return `${path}${where}  +${added} −${removed}`;
  }

  @remote('commit') commit(_ask: {
    message: string;
    files: string[];
    amend?: boolean;
    name?: string;
    email?: string;
  }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('shelve') shelve(_ask: { name: string; files: string[] }): Promise<{ error: string | null; item?: ShelfItem }> {
    return stub();
  }
  @remote('shelves') shelves(): Promise<ShelfItem[]> {
    return stub();
  }
  @remote('unshelve') unshelve(_ask: { id: string; files?: string[] }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('drop') drop(_ask: { id: string }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('write') write(_ask: { path: string; text: string }): Promise<{ error: string | null }> {
    return undefined as never;
  }
  @remote('patchBase') patchBase(_ask: { id: string; path: string }): Promise<{ text: string | null }> {
    return undefined as never;
  }
  @remote('patch') patch(_ask: { id: string }): Promise<{ text: string }> {
    return stub();
  }
  @remote('lists') lists(): Promise<Changelist[]> {
    return stub();
  }
  @remote('listCreate') listCreate(_ask: { name: string }): Promise<Changelist> {
    return stub();
  }
  @remote('listRename') listRename(_ask: { id: string; name: string }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('listRemove') listRemove(_ask: { id: string }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('listMove') listMove(_ask: { id: string; files: string[] }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('revert') revert(_ask: { files: string[] }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('shelfRename') shelfRename(_ask: { id: string; name: string }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('lastMessage') lastMessage(): Promise<{ text: string }> {
    return stub();
  }
  @remote('draftRead') draftRead(): Promise<{ text: string }> {
    return stub();
  }
  @remote('draftWrite') draftWrite(_ask: { text: string }): Promise<{ error: string | null }> {
    return stub();
  }
  @remote('identity') identity(): Promise<{ name: string; email: string; fromGit: { name: string; email: string } }> {
    return stub();
  }
  @remote('identityWrite') identityWrite(_ask: { name: string; email: string }): Promise<{ error: string | null }> {
    return stub();
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const open = this.opened();
    this.changes.open.value = open.value;

    this.changes.follow(this.ide.workspaces.current, this.ide.project, this.ide.connected);

    effect(() => {
      this.changes.message.value;
      if (!this.ide.project.value) return;
      if (this.saving) clearTimeout(this.saving);
      this.saving = setTimeout(() => void this.changes.saveDraft(), 500);
    });

    effect(() => {
      const docs = this.ide.getPlugin(DocPlugin);
      docs.openAsked.value;
      docs.openEpoch.value;
      docs.pendingReveal.value;
      docs.viewedFile.value;
      this.diff.close();
    });

    const shownDiff = computed(() => {
      const path = this.diff.path.value;
      if (path === null || this.diff.from.value !== '') return '';
      const files = this.ide.getPlugin(GitPlugin).snapshot.value.files;
      return `${files[path] ?? 'clean'}\u0000${path}`;
    });
    let diffSeen = '';
    effect(() => {
      const now = shownDiff.value;
      const was = diffSeen;
      diffSeen = now;
      const what = this.diff.decide(was, now);
      if (what.do === 'skip') return;
      if (what.do === 'close') {
        this.diff.close();
        return;
      }
      void this.diff.show(what.path, what.state);
    });

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
          windows={this.ide.getPlugin(UiPlugin).windows}
          onOpen={(path) => this.openFile(path)}
          onDiff={(row) => void this.diff.show(row.path, row.state === 'deleted' ? 'deleted' : 'other', row.from)}
          onShelfDiff={(item, path) => void this.showShelved(item, path)}
          onMenu={(at, list) => (this.menu.value = { ...at, items: this.rowMenu(list) })}
          onShelfMenu={(at, item) => (this.menu.value = { ...at, items: this.shelfMenu(item) })}
          onShelve={() => this.askShelve(this.changes.picked.value)}
          onRefresh={() => void this.ide.getPlugin(GitPlugin).refresh()}
          typeahead={this.find}
          shown={this.diff.open.value ? this.diff.path.value : null}
        />
      ),
      close: () => {
        open.value = false;
      },
    });

    this.ide.registry('main.overlay').add({
      id: 'changes.diff',
      title: 'changes.diffTitle',
      heading: () => this.diffHeading(),
      open: this.diff.open,
      keys: 'diff',
      takesFocus: false,
      badges: () => this.modeSwitch(),
      view: () => (
        <DiffView
          diff={this.diff}
          paint={(text, path) => this.ide.getPlugin(CodePlugin).painter.paint(text, path)}
          mode={this.mode()}
          onRevert={this.diff.from.value === '' ? (hunk) => void this.revertHunk(hunk) : null}
        />
      ),
      close: () => this.diff.close(),
    });

    this.ide.surface(() => {
      const at = this.menu.value;
      const windows = this.ide.getPlugin(UiPlugin).windows;
      return (
        <>
          {at && <Menu windows={windows} x={at.x} y={at.y} items={at.items} onClose={() => (this.menu.value = null)} />}
          <AskPopup windows={windows} asking={this.asking} />
        </>
      );
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
