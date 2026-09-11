import { signal } from '@preact/signals';
import type { Visit } from './types.js';
import type DocPlugin from '@ide/plugin-doc';
import { type Mount } from '@ide/api/client';

export interface VisitsRemote {
  list(): Promise<Visit[]>;
  save(visits: Visit[]): Promise<unknown>;
}

export class Visits {
  readonly list = signal<Visit[]>([]);
  readonly at = signal(-1);

  private readonly far = 12;
  private readonly limit = 30;
  private readonly saveDelay = 800;
  private readonly settleDelay = 400;

  private walking = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly remote: VisitsRemote,
    private readonly docs: () => Pick<DocPlugin, 'goTo'>,
  ) {}

  canGoBack(): boolean {
    return this.at.value > 0;
  }

  canGoForward(): boolean {
    return this.at.value >= 0 && this.at.value < this.list.value.length - 1;
  }

  async load(): Promise<void> {
    try {
      const list = await this.remote.list();
      this.list.value = list;
      this.at.value = list.length - 1;
    } catch {
      this.forget();
    }
  }

  forget(): void {
    this.list.value = [];
    this.at.value = -1;
  }

  visit(path: string, line: number, character = 0): void {
    if (this.walking) return;
    const next = this.next(this.list.value, this.at.value, path, line, character);
    if (!next) return;
    this.list.value = next.list;
    this.at.value = next.at;
    this.schedule();
  }

  next(
    list: Visit[],
    at: number,
    path: string,
    line: number,
    character = 0,
    far = this.far,
    limit = this.limit,
  ): { list: Visit[]; at: number } | null {
    const here = list[at];
    if (here && here.path === path && Math.abs(here.line - line) < far) {
      if (here.line === line && (here.character ?? 0) === character) return null;
      const updated = [...list];
      updated[at] = { path, line, character };
      return { list: updated, at };
    }
    const kept = list.slice(0, at + 1).slice(-(limit - 1));
    const next = [...kept, { path, line, character }];
    return { list: next, at: next.length - 1 };  }

  back(): void {
    if (!this.canGoBack()) return;
    void this.jump(this.at.value - 1);
  }

  forward(): void {
    if (!this.canGoForward()) return;
    void this.jump(this.at.value + 1);
  }

  installMouseNav(mount: Pick<Mount, 'listen'>): () => void {
    const noMenu = (event: Event) => event.preventDefault();

    const onDown = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 3) this.back();
      else this.forward();
    };
    const swallow = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    const offs = [
      mount.listen('contextmenu', noMenu, { capture: true }),
      mount.listen('mousedown', onDown, { capture: true }),
      mount.listen('auxclick', swallow, { capture: true }),
      mount.listen('mouseup', swallow, { capture: true }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }

  private async jump(to: number): Promise<void> {
    const target = this.list.value[to];
    if (!target) return;
    this.walking = true;
    this.at.value = to;
    try {
      await this.docs().goTo(target.path, target.line, target.character);
    } finally {
      setTimeout(() => {
        this.walking = false;
      }, this.settleDelay);
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.remote.save(this.list.peek()).catch(() => undefined);
    }, this.saveDelay);
  }
}
