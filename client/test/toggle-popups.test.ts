import { beforeEach, describe, expect, it } from 'vitest';
import { registerCommand, runCommand, opensOpenPopup } from '../src/keys/commands.js';
import { enter, leave, stack } from '../src/state/popups.js';

describe('повторное нажатие закрывает окно', () => {
  beforeEach(() => {
    stack.value = [];
  });

  it('окно открыто — нажатие закрывает его, а не открывает второе', () => {
    let opened = 0;
    let closed = 0;
    registerCommand('git.branches', () => {
      opened += 1;
    });

    runCommand('git.branches');
    expect(opened).toBe(1);

    enter({ id: 'branches', close: () => (closed += 1) });
    runCommand('git.branches');
    expect(closed).toBe(1);
    expect(opened).toBe(1);
  });

  it('чужое открытое окно своей команде не мешает', () => {
    let opened = 0;
    registerCommand('scripts.open', () => {
      opened += 1;
    });
    enter({ id: 'branches', close: () => {} });
    runCommand('scripts.open');
    expect(opened).toBe(1);
  });

  it('закрытое окно снова открывается', () => {
    let opened = 0;
    registerCommand('keys.show', () => {
      opened += 1;
    });
    enter({ id: 'keys', close: () => leave('keys') });
    runCommand('keys.show');
    expect(stack.value).toHaveLength(0);
    runCommand('keys.show');
    expect(opened).toBe(1);
  });

  it('окно «Keys» узнаётся снаружи: оно ловит клавиши и должно закрыться', () => {
    expect(opensOpenPopup('keys.show')).toBe(false);
    enter({ id: 'keys', close: () => {} });
    expect(opensOpenPopup('keys.show')).toBe(true);
    expect(opensOpenPopup('git.push')).toBe(false);
  });

  it('команда без окна работает как раньше', () => {
    let ran = 0;
    registerCommand('file.save', () => {
      ran += 1;
    });
    enter({ id: 'search', close: () => {} });
    runCommand('file.save');
    expect(ran).toBe(1);
  });
});
