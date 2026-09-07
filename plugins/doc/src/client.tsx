import { activate, docs, project, t, workspaces } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import type { DocState } from '@ide/protocol';
import { effect } from '@preact/signals';
import { Doc, type Reveal } from './doc.js';
import { EditorFocus } from './focus.js';

export type { Reveal } from './doc.js';

export default class DocPlugin {
  readonly doc: Doc;
  readonly focus = new EditorFocus();

  constructor(private readonly ide: Ide) {
    this.doc = new Doc(docs, {
      say: (message) => ide.say(message),
      complain: (message) => ide.complain(message),
      t,
      remembered: (root) => ide.remember<string | null>(`file:${root}`, null, 'tab'),
    });
    current = this;
  }

  @activate() protected start(): void {
    this.ide.command('file.save', () => void this.doc.save());
    this.ide.command('file.reload', () => void this.doc.reload());

    effect(() => {
      workspaces.current.value;
      this.doc.reset();
    });
    effect(() => {
      const ws = project.value;
      if (ws) void this.doc.attached(ws.root);
    });
    effect(() => {
      const ws = workspaces.current.value;
      const file = this.doc.open.value;
      if (!ws) return;
      document.title = file ? `${file.path} — ${ws.name}` : ws.name;
    });
  }

  async openFile(path: string, options?: { focus?: boolean }): Promise<void> {
    if (options?.focus === false) this.focus.openWithoutFocus();
    await this.doc.openAt(path, workspaces.current.value?.root ?? null);
    if (options?.focus) this.focus.focus();
  }

  async goTo(path: string, line: number, character = 0): Promise<void> {
    if (this.doc.open.peek()?.path !== path) await this.openFile(path);
    this.doc.reveal(path, line, character);
  }

  async peekFile(path: string): Promise<{ path: string; text: string }> {
    const state = await docs.state(path);
    return { path: state.path, text: state.text };
  }

  closeFile(): Promise<void> {
    return this.doc.close(workspaces.current.value?.root ?? null);
  }
}

let current: DocPlugin | null = null;

function live(): DocPlugin {
  if (!current) throw new Error('@ide/plugin-doc не поднят');
  return current;
}

export const openDoc: { readonly value: DocState | null } = {
  get value() {
    return live().doc.open.value;
  },
};
export const dirty: { readonly value: boolean } = {
  get value() {
    return live().doc.dirty.value;
  },
};
export const externalEpoch: { readonly value: number } = {
  get value() {
    return live().doc.externalEpoch.value;
  },
};
export const pendingReveal: { readonly value: Reveal | null } = {
  get value() {
    return live().doc.pendingReveal.value;
  },
};
export const diverged: { readonly value: ReadonlyMap<string, 'changed' | 'removed'> } = {
  get value() {
    return live().doc.diverged.value;
  },
};
export const wantsFocus: { readonly value: number } = {
  get value() {
    return live().focus.wanted.value;
  },
};

export function goTo(path: string, line: number, character?: number): Promise<void> {
  return live().goTo(path, line, character);
}
export function openFile(path: string, options?: { focus?: boolean }): Promise<void> {
  return live().openFile(path, options);
}
export function flushDocs(): Promise<void> {
  return live().doc.sync.flush();
}
export function peekFile(path: string): Promise<{ path: string; text: string }> {
  return live().peekFile(path);
}
export function editDoc(text: string): void {
  live().doc.edit(text);
}
export function closeFile(): Promise<void> {
  return live().closeFile();
}
export function reloadFile(): Promise<void> {
  return live().doc.reload();
}
export function takeFocusOnMount(): boolean {
  return live().focus.takeOnMount();
}
export function onMergeRequested(handler: (path: string) => void): () => void {
  return live().doc.onMergeRequested(handler);
}
export function expectExternal(path: string): void {
  live().doc.expectExternal(path);
}
export function forgetDiverged(path: string): void {
  live().doc.forgetDiverged(path);
}
