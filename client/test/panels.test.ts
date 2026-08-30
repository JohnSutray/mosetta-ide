import { describe, expect, it } from 'vitest';
import { Registry } from '../src/state/registry.js';
import { registerPanelWishes } from '../src/ui/panel-wishes.js';
import { PANELS } from '../src/ui/panels.js';

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

function wishes(): PanelWish[] {
  const complaints: string[] = [];
  const store = new Registry((message) => complaints.push(message));
  registerPanelWishes(store);
  expect(complaints, `ядро пишет не по форме: ${complaints.join('; ')}`).toEqual([]);
  return store.all<PanelWish>('panel').value;
}

describe('пожелания ядра про панели', () => {
  it('каждая панель реестра просит себе колонку', () => {
    const asked = new Set(wishes().map((one) => one.id));
    const missing = PANELS.filter((panel) => !asked.has(panel.id)).map((p) => p.id);
    expect(missing, `панели без пожелания: ${missing.join(', ')}`).toEqual([]);
  });

  it('редактор тоже панель, хоть его и нет в реестре колонок', () => {
    const editor = wishes().find((one) => one.id === 'editor');
    expect(editor, 'редактор себя не просит').toBeDefined();
    expect(editor!.side).toBe('main');
    expect(editor!.defaultWidth).toBeUndefined();
  });

  it('середина одна', () => {
    expect(wishes().filter((one) => one.side === 'main')).toHaveLength(1);
  });

  it('навигация слева, рабочее справа', () => {
    const side = (id: string) => wishes().find((one) => one.id === id)?.side;
    expect(side('tree')).toBe('left');
    expect(side('terminal')).toBe('right');
  });

  it('сторона и ширины повторяют реестр, а не выдуманы заново', () => {
    for (const spec of PANELS) {
      const wish = wishes().find((one) => one.id === spec.id)!;
      expect(wish.side).toBe(spec.side);
      expect(wish.defaultWidth).toBe(spec.defaultWidth);
      expect(wish.minWidth).toBe(spec.minWidth);
    }
  });

  it('пожелание держит ТОТ ЖЕ сигнал, а не копию', () => {
    for (const spec of PANELS) {
      const wish = wishes().find((one) => one.id === spec.id)!;
      expect(wish.open).toBe(spec.open);
    }
  });

  it('заголовок — ключ словаря, а путь файла — отдельным полем', () => {
    for (const wish of wishes()) {
      expect(wish.title).toMatch(/^panel\./);
    }
    const editor = wishes().find((one) => one.id === 'editor')!;
    expect(typeof editor.heading).toBe('function');
  });

  it('каждую колонку можно закрыть, и содержимое у каждой есть', () => {
    for (const wish of wishes()) {
      expect(typeof wish.close, `${wish.id}: нечем закрыть`).toBe('function');
      expect(typeof wish.view, `${wish.id}: нечего показать`).toBe('function');
    }
  });
});
