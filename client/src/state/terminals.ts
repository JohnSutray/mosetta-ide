import { batch, signal } from '@preact/signals';
import type { NpmScriptInfo, TerminalInfo } from '@ide/protocol';
import { complain, rpc, terminalPanelVisible } from './session.js';
import { t } from '../i18n/index.js';

export const terminals = signal<TerminalInfo[]>([]);
export const activeTerminal = signal<string | null>(null);
export const scripts = signal<NpmScriptInfo[]>([]);

type DataSink = (data: string) => void;
const sinks = new Map<string, Set<DataSink>>();

export function onTerminalData(name: string, sink: DataSink): () => void {
  const set = sinks.get(name) ?? new Set();
  set.add(sink);
  sinks.set(name, set);
  return () => set.delete(sink);
}

export async function refreshTerminals(): Promise<void> {
  try {
    terminals.value = await rpc.call('term.list', null);
  } catch {}
}

export async function refreshScripts(): Promise<void> {
  try {
    scripts.value = await rpc.call('npm.list', null);
  } catch {}
}

export async function createTerminal(): Promise<void> {
  await showTerminal(() => rpc.call('term.create', {}));
}

export async function runScript(id: string): Promise<void> {
  await showTerminal(() => rpc.call('npm.run', { id }));
}

export function focusTerminal(name: string): void {
  batch(() => {
    activeTerminal.value = name;
    terminalPanelVisible.value = true;
  });
}

export async function closeTerminal(name: string): Promise<void> {
  try {
    await rpc.call('term.close', { name });
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
  }
  await refreshTerminals();
  if (activeTerminal.value === name) {
    activeTerminal.value = terminals.value[0]?.name ?? null;
  }
}

async function showTerminal(open: () => Promise<TerminalInfo>): Promise<void> {
  try {
    const info = await open();
    batch(() => {
      activeTerminal.value = info.name;
      terminalPanelVisible.value = true;
    });
    await refreshTerminals();
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
  }
}

rpc.on('term.list', (list) => {
  terminals.value = list;
  if (activeTerminal.value && !list.some((info) => info.name === activeTerminal.value)) {
    activeTerminal.value = list[0]?.name ?? null;
  }
  if (list.length === 0) terminalPanelVisible.value = false;
});

rpc.on('term.data', ({ name, data }) => {
  for (const sink of sinks.get(name) ?? []) sink(data);
});

rpc.on('term.exit', ({ name }) => {
  void refreshTerminals();
  const note = `\r\n\x1b[38;5;245m${t('terminal.finished')}\x1b[0m\r\n`;
  for (const sink of sinks.get(name) ?? []) sink(note);
});
