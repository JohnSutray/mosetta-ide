import { commands } from '../src/keys/commands.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { popups } from '@ide/windows';

describe('повторное нажатие закрывает окно', () => {
  beforeEach(() => {
    popups.stack.value = [];
  });

  it('окно открыто — нажатие закрывает его, а не открывает второе', () => {
    let opened = 0;
    let closed = 0;
    commands.registerPlugin('git.branches', () => {
      opened += 1;
    });

    commands.run('git.branches');
    expect(opened).toBe(1);

    popups.enter({ id: 'git.branches', close: () => (closed += 1) });
    commands.run('git.branches');
    expect(closed).toBe(1);
    expect(opened).toBe(1);
  });

  it('чужое открытое окно своей команде не мешает', () => {
    let opened = 0;
    commands.registerPlugin('scripts.open', () => {
      opened += 1;
    });
    popups.enter({ id: 'git.branches', close: () => {} });
    commands.run('scripts.open');
    expect(opened).toBe(1);
  });

  it('закрытое окно снова открывается', () => {
    let opened = 0;
    commands.registerPlugin('keys.show', () => {
      opened += 1;
    });
    popups.enter({ id: 'keys.show', close: () => popups.leave('keys.show') });
    commands.run('keys.show');
    expect(popups.stack.value).toHaveLength(0);
    commands.run('keys.show');
    expect(opened).toBe(1);
  });

  it('окно узнаётся снаружи только по имени команды', () => {
    commands.registerPlugin('keys.show', () => {});
    expect(commands.opensOpenPopup('keys.show')).toBe(false);
    popups.enter({ id: 'keys.show', close: () => {} });
    expect(commands.opensOpenPopup('keys.show')).toBe(true);
    popups.enter({ id: 'push-window', close: () => {} });
    expect(commands.opensOpenPopup('git.push')).toBe(false);
  });

  it('команда ядра без окна работает как раньше', () => {
    let ran = 0;
    commands.register('key.reserved', () => {
      ran += 1;
    });
    popups.enter({ id: 'search.everywhere', close: () => {} });
    commands.run('key.reserved');
    expect(ran).toBe(1);
  });
});
