import { describe, expect, it } from 'vitest';
import { COMMAND_IDS, COMMANDS, isCommandId, type CommandId } from '@ide/protocol';
import { PANELS } from '../src/ui/panels.js';
import { Registry } from '../src/state/registry.js';
import { registerToolbarWishes } from '../src/ui/toolbar-wishes.js';
import { WORLDS, inWorld, keymap, toolbarOrder } from './keymap-shared.js';
import en from '../src/i18n/en.json';

interface Wish {
  id: string;
  title: string;
  command: string;
  icon: (filled: boolean) => unknown;
  active?: { readonly value: boolean };
  visible?: { readonly value: boolean };
}

function wishes(): { buttons: Wish[]; widgets: Array<{ id: string; side: string }> } {
  const complaints: string[] = [];
  const store = new Registry((message) => complaints.push(message));
  registerToolbarWishes(store);
  expect(complaints, `ядро пишет не по форме: ${complaints.join('; ')}`).toEqual([]);
  return {
    buttons: store.all<Wish>('toolbar.button').value,
    widgets: store.all<{ id: string; side: string }>('toolbar.widget').value,
  };
}

describe('тулбар', () => {
  it('каждая панель как-то представлена', () => {
    const asked = new Set(wishes().buttons.map((entry) => entry.command));
    const missing = PANELS.filter((panel) => !asked.has(panel.command)).map((p) => p.id);
    expect(missing, `панели, которые никак не просят себя показать: ${missing.join(', ')}`).toEqual(
      ['terminal'],
    );
    expect(wishes().widgets.map((one) => one.id)).toContain('terminals');
  });

  it('кнопка панели показывает ТОТ ЖЕ сигнал, а не копию', () => {
    const buttons = wishes().buttons;
    for (const panel of PANELS) {
      const entry = buttons.find((item) => item.command === panel.command);
      if (!entry) continue;
      expect(entry.active, `${panel.id}: кнопка без состояния`).toBeDefined();
      expect(entry.active).toBe(panel.open);
    }
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
  });

  it('кнопка тулбара показывает панель, попап или настройку — но всегда состояние', () => {
    const panels = new Set<string>(PANELS.map((panel) => panel.command));
    const popups = wishes()
      .buttons.filter((entry) => !panels.has(entry.command) && entry.active)
      .map((e) => e.id);
    expect(popups.sort()).toEqual([
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
    const unknown = wishes().buttons.filter((entry) => !isCommandId(entry.command)).map((e) => e.command);
    expect(unknown, `неизвестные команды: ${unknown.join(', ')}`).toEqual([]);
  });

  it('у каждой кнопки есть подсказка и иконка', () => {
    for (const entry of wishes().buttons) {
      expect(entry.title.trim(), `${entry.id}: пустая подсказка`).not.toBe('');
      expect(typeof entry.icon, `${entry.id}: нет значка`).toBe('function');
    }
  });

  it('надписи реестра — ключи словаря, и все они в словаре есть', () => {
    const dictionary = en as Record<string, string>;
    const keys = [
      ...PANELS.flatMap((p) => [p.title, p.tooltip]),
      ...wishes().buttons.map((e) => e.title),
    ];
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
    const conditional = wishes().buttons.filter((entry) => entry.visible).map((entry) => entry.id);
    expect(conditional).toEqual(['merge']);
  });

  it('условной кнопки нет в порядке — иначе цифры поедут', () => {
    const order = toolbarOrder();
    const named = wishes().buttons.filter((entry) => entry.visible && order.includes(entry.command));
    expect(named.map((entry) => entry.id)).toEqual([]);
  });

  it('единственная кнопка без состояния — заведение терминала', () => {
    const stateless = wishes().buttons.filter((entry) => !entry.active).map((entry) => entry.id);
    expect(stateless).toEqual(['terminal.create']);
  });

  it('цифра — это порядковый номер кнопки в тулбаре, слева направо', () => {
    const NUMBERED = toolbarOrder().slice(0, 10);
    const bindings = keymap().bindings;
    for (const world of WORLDS) {
      const numbered = new Map<string, string>();
      for (const binding of inWorld(bindings, world)) {
        if ((binding.when ?? 'global') !== 'global') continue;
        const digit = /(?:^|\+)(\d)$/.exec(binding.key)?.[1];
        if (digit) numbered.set(digit, binding.command);
      }
      NUMBERED.forEach((command, at) => {
        const digit = String((at + 1) % 10);
        expect(numbered.get(digit), `${world.scope}: цифра ${digit} зовёт не ту кнопку`).toBe(
          command,
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
      const lost = wishes()
        .buttons.filter((entry) => !reachable.has(entry.command as never))
        .map((e) => e.id);
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
