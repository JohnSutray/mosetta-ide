import { signal } from '@preact/signals';
import { PANELS } from '../ui/panels.js';

const STORAGE_KEY = 'new-ide.panel-widths';

function initial(): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const panel of PANELS) widths[panel.id] = panel.defaultWidth;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    for (const [id, value] of Object.entries(saved)) {
      if (typeof value === 'number' && Number.isFinite(value)) widths[id] = value;
    }
  } catch {}
  return widths;
}

export const panelWidths = signal<Record<string, number>>(initial());

export function widthOf(id: string): number {
  return panelWidths.value[id] ?? PANELS.find((p) => p.id === id)?.defaultWidth ?? 260;
}

export function setPanelWidth(id: string, px: number): void {
  const panel = PANELS.find((item) => item.id === id);
  const min = panel?.minWidth ?? 150;
  const max = Math.max(min, window.innerWidth - 320);
  const width = Math.min(max, Math.max(min, Math.round(px)));
  panelWidths.value = { ...panelWidths.value, [id]: width };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelWidths.value));
  } catch {}
}
