import { workspaces } from '@ide/api/client';
import { batch, effect, signal } from '@preact/signals';
import type { DirSuggestion, RecentProject } from './types.js';

export interface ProjectsRemote {
  roots(): Promise<DirSuggestion[]>;
  recent(): Promise<RecentProject[]>;
  browse(prefix: string, options?: { depth?: number; limit?: number }): Promise<DirSuggestion[]>;
  remember(): Promise<void>;
}

export class Projects {
  readonly visible = signal(false);
  readonly draft = signal('');

  readonly roots = signal<DirSuggestion[]>([]);
  readonly children = signal<Map<string, DirSuggestion[]>>(new Map());
  readonly expanded = signal<Set<string>>(new Set());
  readonly showingAll = signal<Set<string>>(new Set());
  readonly page = 100;

  readonly suggestOpen = signal(false);
  readonly suggestions = signal<DirSuggestion[]>([]);
  readonly selected = signal(-1);

  readonly recent = signal<RecentProject[]>([]);

  private token = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly remote: ProjectsRemote) {
    effect(() => {
      if (workspaces.current.value) this.hide();
      else this.show();
    });
  }

  show(): void {
    this.visible.value = true;
    void this.load();
  }

  toggle(): void {
    if (this.visible.value) this.hide();
    else this.show();
  }

  hide(): void {
    if (!workspaces.current.value) return;
    batch(() => {
      this.visible.value = false;
      this.closeSuggest();
    });
  }

  async load(): Promise<void> {
    try {
      const [roots, history] = await Promise.all([this.remote.roots(), this.remote.recent()]);
      const children = new Map(this.children.value);
      for (const root of roots) this.absorb(children, root);
      batch(() => {
        this.roots.value = roots;
        this.children.value = children;
        this.recent.value = history;
        if (roots[0] && this.expanded.value.size === 0) {
          this.expanded.value = new Set([roots[0].path]);
        }
      });
    } catch {}
  }

  showAllIn(dir: string): void {
    const next = new Set(this.showingAll.value);
    next.add(dir);
    this.showingAll.value = next;
  }

  pickDir(item: DirSuggestion): void {
    batch(() => {
      this.draft.value = item.path;
      this.closeSuggest();
      const open = new Set(this.expanded.value);
      if (open.has(item.path)) open.delete(item.path);
      else open.add(item.path);
      this.expanded.value = open;
    });
    if (!this.children.value.has(item.path)) void this.loadChildren(item.path);
  }

  setDraft(value: string): void {
    batch(() => {
      this.draft.value = value;
      this.selected.value = -1;
    });
    if (!this.suggestOpen.value) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refreshSuggestions(value);
    }, 70);
  }

  openSuggest(): void {
    this.suggestOpen.value = true;
    void this.refreshSuggestions(this.draft.value);
  }

  closeSuggest(): void {
    batch(() => {
      this.suggestOpen.value = false;
      this.suggestions.value = [];
      this.selected.value = -1;
    });
  }

  moveSuggestion(delta: number): void {
    const total = this.suggestions.value.length;
    if (total === 0) return;
    const next = this.selected.value + delta;
    this.selected.value = next < -1 ? total - 1 : next >= total ? -1 : next;
  }

  complete(): void {
    const pick = this.suggestions.value[this.selected.value] ?? this.suggestions.value[0];
    if (!pick) return;
    batch(() => {
      this.draft.value = `${pick.path}/`;
      this.selected.value = -1;
    });
    void this.refreshSuggestions(this.draft.value);
  }

  accept(): void {
    if (this.suggestOpen.value && this.selected.value >= 0) {
      this.complete();
      return;
    }
    this.choose(this.draft.value.trim());
  }

  choose(root: string, liveId?: string): void {
    if (root === '' && !liveId) return;
    if (liveId && workspaces.current.value?.id === liveId) {
      this.hide();
      return;
    }
    const going = liveId ? workspaces.switchTo(liveId) : workspaces.open(root);
    void going.then(async () => {
      if (!workspaces.current.value) return;
      if (!liveId) await this.remote.remember().catch(() => undefined);
      this.hide();
      void this.load();
    });
  }

  private absorb(map: Map<string, DirSuggestion[]>, item: DirSuggestion): void {
    if (!item.children) return;
    map.set(item.path, item.children);
    for (const child of item.children) this.absorb(map, child);
  }

  private async loadChildren(dir: string): Promise<void> {
    const next = new Map(this.children.value);
    try {
      next.set(dir, await this.remote.browse(`${dir}/`, { depth: 1 }));
    } catch {
      next.set(dir, []);
    }
    this.children.value = next;
  }

  private async refreshSuggestions(prefix: string): Promise<void> {
    const token = ++this.token;
    try {
      const list = await this.remote.browse(prefix, { limit: 24 });
      if (token !== this.token) return;
      this.suggestions.value = list;
    } catch {
      if (token === this.token) this.suggestions.value = [];
    }
  }
}
