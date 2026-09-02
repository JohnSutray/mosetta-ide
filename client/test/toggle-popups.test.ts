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
    commands.register('git.branches', () => {
      opened += 1;
    });

    commands.run('git.branches');
    expect(opened).toBe(1);

    popups.enter({ id: 'branches', close: () => (closed += 1) });
    commands.run('git.branches');
    expect(closed).toBe(1);
    expect(opened).toBe(1);
  });

  it('чужое открытое окно своей команде не мешает', () => {
    let opened = 0;
    commands.registerPlugin('scripts.open', () => {
      opened += 1;
    });
    popups.enter({ id: 'branches', close: () => {} });
    commands.run('scripts.open');
    expect(opened).toBe(1);
  });

  it('закрытое окно снова открывается', () => {
    let opened = 0;
    commands.register('keys.show', () => {
      opened += 1;
    });
    popups.enter({ id: 'keys', close: () => popups.leave('keys') });
    commands.run('keys.show');
    expect(popups.stack.value).toHaveLength(0);
    commands.run('keys.show');
    expect(opened).toBe(1);
  });

  it('окно «Keys» узнаётся снаружи: оно ловит клавиши и должно закрыться', () => {
    expect(commands.opensOpenPopup('keys.show')).toBe(false);
    popups.enter({ id: 'keys', close: () => {} });
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
