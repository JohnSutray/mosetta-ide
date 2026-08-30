import { popups } from '../src/state/popups.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  opensOpenPopup,
  registerCommand,
  registerPluginCommand,
  runCommand,
} from '../src/keys/commands.js';

describe('повторное нажатие закрывает окно', () => {
  beforeEach(() => {
    popups.stack.value = [];
  });

  it('окно открыто — нажатие закрывает его, а не открывает второе', () => {
    let opened = 0;
    let closed = 0;
    registerCommand('git.branches', () => {
      opened += 1;
    });

    runCommand('git.branches');
    expect(opened).toBe(1);

    popups.enter({ id: 'branches', close: () => (closed += 1) });
    runCommand('git.branches');
    expect(closed).toBe(1);
    expect(opened).toBe(1);
  });

  it('чужое открытое окно своей команде не мешает', () => {
    let opened = 0;
    registerPluginCommand('scripts.open', () => {
      opened += 1;
    });
    popups.enter({ id: 'branches', close: () => {} });
    runCommand('scripts.open');
    expect(opened).toBe(1);
  });

  it('закрытое окно снова открывается', () => {
    let opened = 0;
    registerCommand('keys.show', () => {
      opened += 1;
    });
    popups.enter({ id: 'keys', close: () => popups.leave('keys') });
    runCommand('keys.show');
    expect(popups.stack.value).toHaveLength(0);
    runCommand('keys.show');
    expect(opened).toBe(1);
  });

  it('окно «Keys» узнаётся снаружи: оно ловит клавиши и должно закрыться', () => {
    expect(opensOpenPopup('keys.show')).toBe(false);
    popups.enter({ id: 'keys', close: () => {} });
    expect(opensOpenPopup('keys.show')).toBe(true);
    expect(opensOpenPopup('git.push')).toBe(false);
  });

  it('команда без окна работает как раньше', () => {
    let ran = 0;
    registerCommand('file.save', () => {
      ran += 1;
    });
    popups.enter({ id: 'search', close: () => {} });
    runCommand('file.save');
    expect(ran).toBe(1);
  });
});
