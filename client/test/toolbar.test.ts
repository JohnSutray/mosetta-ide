import { describe, expect, it } from 'vitest';
import { COMMANDS, isCommandId, type CommandId } from '@ide/protocol';
import { PANELS, TOOLBAR } from '../src/ui/panels.js';

describe('тулбар', () => {
  it('у каждой панели есть кнопка', () => {
    const inToolbar = new Set(TOOLBAR.map((entry) => entry.id));
    const missing = PANELS.filter((panel) => !inToolbar.has(panel.id)).map((p) => p.id);
    expect(missing, `панели без кнопки в тулбаре: ${missing.join(', ')}`).toEqual([]);
  });

  it('у каждой панели кнопка показывает её состояние', () => {
    for (const panel of PANELS) {
      const entry = TOOLBAR.find((item) => item.id === panel.id)!;
      expect(entry.active, `${panel.id}: кнопка без состояния`).toBeDefined();
      expect(entry.active).toBe(panel.open);
    }
  });

  it('каждая кнопка зовёт существующую команду', () => {
    const unknown = TOOLBAR.filter((entry) => !isCommandId(entry.command)).map((e) => e.command);
    expect(unknown, `неизвестные команды: ${unknown.join(', ')}`).toEqual([]);
  });

  it('у каждой кнопки есть подсказка и иконка', () => {
    for (const entry of TOOLBAR) {
      expect(entry.title.trim(), `${entry.id}: пустая подсказка`).not.toBe('');
      expect(entry.icon, `${entry.id}: нет иконки`).toBeTruthy();
    }
  });

  it('ручной терминал — единственная кнопка без состояния', () => {
    const stateless = TOOLBAR.filter((entry) => !entry.active).map((entry) => entry.id);
    expect(stateless).toEqual(['manual-terminal']);
  });

  it('панельные команды объявлены в протоколе с человеческим именем', () => {
    for (const panel of PANELS) {
      const title = COMMANDS[panel.command as CommandId];
      expect(title, `${panel.command}: нет названия`).toBeTruthy();
    }
  });
});
