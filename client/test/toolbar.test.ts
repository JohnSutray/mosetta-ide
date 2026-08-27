import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMMAND_IDS, COMMANDS, isCommandId, type CommandId } from '@ide/protocol';
import { PANELS, TOOLBAR } from '../src/ui/panels.js';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';
import en from '../src/i18n/en.json';

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

  it('кнопка тулбара показывает панель, попап или настройку — но всегда состояние', () => {
    const panels = new Set(PANELS.map((panel) => panel.id));
    const popups = TOOLBAR.filter((entry) => !panels.has(entry.id) && entry.active).map((e) => e.id);
    expect(popups.sort()).toEqual([
      'editor',
      'git.branches',
      'git.push',
      'keys',
      'merge',
      'projects',
      'search',
      'tree.follow',
    ]);
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

  it('у каждой команды есть английское имя в словаре', () => {
    const dictionary = en as Record<string, string>;
    const missing = COMMAND_IDS.filter((id) => dictionary[`command.${id}`] === undefined);
    expect(missing, `нет command.* в en.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('словарь не содержит пустых строк', () => {
    const empty = Object.entries(en as Record<string, string>)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty, `пустые надписи: ${empty.join(', ')}`).toEqual([]);
  });

  it('условная кнопка одна — разрешение конфликтов', () => {
    const conditional = TOOLBAR.filter((entry) => entry.visible).map((entry) => entry.id);
    expect(conditional).toEqual(['merge']);
  });

  it('условные кнопки стоят ПОСЛЕ нумерованных — иначе цифры поедут', () => {
    const first = TOOLBAR.findIndex((entry) => entry.visible);
    expect(first === -1 || first >= 10).toBe(true);
  });

  it('единственная кнопка без состояния — заведение терминала', () => {
    const stateless = TOOLBAR.filter((entry) => !entry.active).map((entry) => entry.id);
    expect(stateless).toEqual(['terminal.create']);
  });

  it('цифра — это порядковый номер кнопки в тулбаре, слева направо', () => {
    const NUMBERED = TOOLBAR.slice(0, 10);
    const bindings = keymap().bindings;
    for (const world of WORLDS) {
      const numbered = new Map<string, CommandId>();
      for (const binding of inWorld(bindings, world)) {
        if ((binding.when ?? 'global') !== 'global') continue;
        const digit = /(?:^|\+)(\d)$/.exec(binding.key)?.[1];
        if (digit) numbered.set(digit, binding.command);
      }
      NUMBERED.forEach((entry, at) => {
        const digit = String((at + 1) % 10);
        expect(numbered.get(digit), `${world.scope}: цифра ${digit} зовёт не ту кнопку`).toBe(
          entry.command,
        );
      });
      expect(numbered.size, `${world.scope}: лишние цифры`).toBe(NUMBERED.length);
    }
  });

  it('до каждой кнопки тулбара можно дотянуться клавишей в каждом окружении', () => {
    const bindings = keymap().bindings;
    for (const world of WORLDS) {
      const reachable = new Set(
        inWorld(bindings, world)
          .filter((binding) => (binding.when ?? 'global') === 'global')
          .map((binding) => binding.command),
      );
      const lost = TOOLBAR.filter((entry) => !reachable.has(entry.command)).map((e) => e.id);
      expect(lost, `${world.scope}: кнопки без клавиши — ${lost.join(', ')}`).toEqual([]);
    }
  });

  it('ветки git висят на клавише под Escape, а не на символе', () => {
    const bound = keymap().bindings.filter((b) => b.key.endsWith('+backquote'));
    expect(bound.length, 'клавиша под Escape потерялась').toBeGreaterThan(0);
    for (const binding of bound) expect(binding.command).toBe('git.branches');
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
