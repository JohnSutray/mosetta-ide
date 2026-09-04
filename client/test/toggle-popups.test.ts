import { commands } from '../src/keys/commands.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { popups } from '@ide/ui';

describe('повторное нажатие закрывает окно', () => {
  beforeEach(() => {
    popups.stack.value = [];
  });

  it('окно открыто — нажатие закрывает его, а не открывает второе', () => {
    let opened = 0;
    let closed = 0;
    commands.register('terminal.shell', () => {
      opened += 1;
    });

    commands.run('terminal.shell');
    expect(opened).toBe(1);

    popups.enter({ id: 'tool-shell', close: () => (closed += 1) });
    commands.run('terminal.shell');
    expect(closed).toBe(1);
    expect(opened).toBe(1);
  });

  it('чужое открытое окно своей команде не мешает', () => {
    let opened = 0;
    commands.registerPlugin('scripts.open', () => {
      opened += 1;
    });
    popups.enter({ id: 'projects', close: () => {} });
    commands.run('scripts.open');
    expect(opened).toBe(1);
  });

  it('закрытое окно снова открывается', () => {
    let opened = 0;
    commands.register('tools.packageManager', () => {
      opened += 1;
    });
    popups.enter({ id: 'tool-manager', close: () => popups.leave('tool-manager') });
    commands.run('tools.packageManager');
    expect(popups.stack.value).toHaveLength(0);
    commands.run('tools.packageManager');
    expect(opened).toBe(1);
  });

  it('окно «Keys» узнаётся снаружи: оно ловит клавиши и должно закрыться', () => {
    commands.registerPlugin('keys.show', () => {});
    expect(commands.opensOpenPopup('keys.show')).toBe(false);
    popups.enter({ id: 'keys.show', close: () => {} });
    expect(commands.opensOpenPopup('keys.show')).toBe(true);
    expect(commands.opensOpenPopup('git.push')).toBe(false);
  });

  it('команда без окна работает как раньше', () => {
    let ran = 0;
    commands.register('file.save', () => {
      ran += 1;
    });
    popups.enter({ id: 'search', close: () => {} });
    commands.run('file.save');
    expect(ran).toBe(1);
  });
});
