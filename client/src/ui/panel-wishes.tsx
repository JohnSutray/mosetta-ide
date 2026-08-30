import { DEFAULT_SETTINGS_FALLBACK } from '../state/fallback.js';
import { settings as settingsSignal } from '../state/config.js';
import {
  closeFile,
  currentDiagnostics,
  dirty,
  editDoc,
  editorPanelVisible,
  externalEpoch,
  openFile,
  pendingReveal,
  rpc,
} from '../state/session.js';
import { activeEditor } from '../state/editor.js';
import { headFor, showHunk } from '../state/git-marks.js';
import { visit } from '../state/visits.js';
import { askSymbol } from '../state/symbols.js';
import { runCommand } from '../keys/commands.js';
import { Editor } from '../editor/editor.js';
import { DivergedBadge } from './diverged.js';
import { SheepField } from './sheep.js';
import { TerminalView } from './terminal.js';
import { Tree } from './tree.js';
import { PANELS } from './panels.js';
import type { Registry } from '../state/registry.js';

interface PanelWish {
  id: string;
  title: string;
  side: 'left' | 'main' | 'right';
  open: { readonly value: boolean };
  view: () => unknown;
  heading?: () => string | null;
  badges?: () => unknown;
  close?: () => void;
  defaultWidth?: number;
  minWidth?: number;
}

function content(id: string) {
  switch (id) {
    case 'tree':
      return <Tree />;
    case 'terminal':
      return <TerminalView />;
    default:
      return null;
  }
}

export function registerPanelWishes(store: Registry): void {
  const panel = (wish: PanelWish) => store.add('panel', wish, 'core');

  for (const spec of PANELS) {
    panel({
      id: spec.id,
      title: spec.title,
      side: spec.side,
      open: spec.open,
      view: () => content(spec.id),
      close: () => runCommand(spec.command),
      defaultWidth: spec.defaultWidth,
      minWidth: spec.minWidth,
    });
  }

  panel({
    id: 'editor',
    title: 'panel.editor.empty',
    side: 'main',
    open: editorPanelVisible,
    heading: () => openFile.value?.path ?? null,
    badges: () => {
      const file = openFile.value;
      if (!file) return null;
      return (
        <>
          {file.truncated && <span class="tag">read-only</span>}
          {dirty.value && <span class="tag is-dirty">modified</span>}
        </>
      );
    },
    close: () => {
      if (openFile.peek()) void closeFile();
      else editorPanelVisible.value = false;
    },
    view: () => <EditorSlot />,
  });
}

function EditorSlot() {
  const file = openFile.value;
  if (!file) return <SheepField />;
  const settings = settingsSignal.value ?? DEFAULT_SETTINGS_FALLBACK;
  return (
    <>
      <DivergedBadge />
      <Editor
        file={file}
        head={headFor(file.path)}
        onHunk={showHunk}
        externalEpoch={externalEpoch.value}
        reveal={pendingReveal.value}
        settings={settings.editor}
        diagnostics={currentDiagnostics.value}
        onEdit={editDoc}
        onCaret={(line, character) => visit(file.path, line, character)}
        onModClick={(pos) => void askSymbol(pos)}
        onHover={(path, line, character) => rpc.call('lsp.hover', { path, line, character })}
        onMount={(view) => (activeEditor.value = view)}
      />
    </>
  );
}
