import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMMANDS, isCommandId, type CommandId, type Keymap } from '@ide/protocol';
import { PANELS, TOOLBAR } from '../src/ui/panels.js';
import en from '../src/i18n/en.json';

function keymap(): Keymap {
  const raw = fs.readFileSync(fileURLToPath(new URL('../../config/keymap.json', import.meta.url)), 'utf8');
  const clean = raw
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(clean) as Keymap;
}

describe('тулбар', () => {
  it('каждая панель как-то представлена в тулбаре', () => {
    const inToolbar = new Set(TOOLBAR.map((entry) => entry.id));
    const missing = PANELS.filter(
      (panel) => panel.toolbar === 'button' && !inToolbar.has(panel.id),
    ).map((p) => p.id);
    expect(missing, `панели без кнопки в тулбаре: ${missing.join(', ')}`).toEqual([]);
  });

  it('кнопка панели показывает ТОТ ЖЕ сигнал, а не копию', () => {
    for (const panel of PANELS) {
      if (panel.toolbar !== 'button') continue;
      const entry = TOOLBAR.find((item) => item.id === panel.id)!;
      expect(entry.active, `${panel.id}: кнопка без состояния`).toBeDefined();
      expect(entry.active).toBe(panel.open);
    }
  });

  it('состояние без кнопки показывают чипы — и только у терминалов', () => {
    const byChips = PANELS.filter((panel) => panel.toolbar === 'chips').map((p) => p.id);
    expect(byChips).toEqual(['terminal']);
  });

  it('у каждой панели есть сторона и разумная ширина', () => {
    for (const panel of PANELS) {
      expect(['left', 'right']).toContain(panel.side);
      expect(panel.defaultWidth).toBeGreaterThanOrEqual(panel.minWidth);
      expect(panel.minWidth).toBeGreaterThan(80);
    }
  });

  it('рабочие панели открываются справа, навигация — слева', () => {
    const side = (id: string) => PANELS.find((panel) => panel.id === id)?.side;
    expect(side('tree')).toBe('left');
    expect(side('terminal')).toBe('right');
    expect(side('problems')).toBe('right');
  });

  it('кнопка тулбара — либо панель, либо попап, но всегда с состоянием', () => {
    const panels = new Set(PANELS.map((panel) => panel.id));
    const popups = TOOLBAR.filter((entry) => !panels.has(entry.id) && entry.active).map((e) => e.id);
    expect(popups.sort()).toEqual(['git.branches', 'git.push', 'projects', 'scripts', 'search']);
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

  it('надписи реестра — ключи словаря, и все они в словаре есть', () => {
    const dictionary = en as Record<string, string>;
    const keys = [...PANELS.flatMap((p) => [p.title, p.tooltip]), ...TOOLBAR.map((e) => e.title)];
    const missing = keys.filter((key) => dictionary[key] === undefined);
    expect(missing, `нет в en.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('словарь не содержит пустых строк', () => {
    const empty = Object.entries(en as Record<string, string>)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty, `пустые надписи: ${empty.join(', ')}`).toEqual([]);
  });

  it('единственная кнопка без состояния — заведение терминала', () => {
    const stateless = TOOLBAR.filter((entry) => !entry.active).map((entry) => entry.id);
    expect(stateless).toEqual(['terminal.create']);
  });

  it('Cmd+цифра — это порядковый номер в тулбаре, слева направо', () => {
    const bindings = keymap().bindings;
    TOOLBAR.forEach((entry, at) => {
      const key = `mod+${at + 1}`;
      const bound = bindings.find((b) => b.key === key && (b.when ?? 'global') === 'global');
      expect(bound, `${key}: нет биндинга на ${at + 1}-ю кнопку тулбара`).toBeDefined();
      expect(bound!.command, `${key} зовёт не ту кнопку`).toBe(entry.command);
    });
  });

  it('номер есть у каждой кнопки тулбара', () => {
    const numbered = keymap().bindings.filter((b) => /^mod\+\d$/.test(b.key));
    expect(numbered.length).toBe(TOOLBAR.length);
  });

  it('ветки git висят на клавише под Escape, а не на символе', () => {
    const bound = keymap().bindings.find((b) => b.key === 'mod+backquote');
    expect(bound?.command).toBe('git.branches');
  });

  it('панельные команды объявлены в протоколе с человеческим именем', () => {
    for (const panel of PANELS) {
      const title = COMMANDS[panel.command as CommandId];
      expect(title, `${panel.command}: нет названия`).toBeTruthy();
    }
  });

  it('у каждой панели своя команда', () => {
    const commands = PANELS.map((panel) => panel.command);
    expect(new Set(commands).size, 'две панели на одной команде').toBe(commands.length);
  });
});
