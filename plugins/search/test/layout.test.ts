import { describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';

/**
 * The search reads what was typed with both keyboard layouts: a human does not look at
 * the keyboard, and `func` regularly comes out as `агтс`.
 */
describe('the keyboard layout', () => {
  it('a Russian-layout typing is read with the English layout', () => {
    expect(layout.retype('агтс')).toBe('func');
    expect(layout.retype('ВШМ')).toBe('DIV');
    expect(layout.retype('ыукмшсу')).toBe('service');
  });

  it('and the other way round', () => {
    expect(layout.retype('ghbdtn')).toBe('привет');
  });

  it('with no letters there is no second variant', () => {
    expect(layout.retype('123')).toBeNull();
    expect(layout.retype('src/main.ts')).not.toBe('src/main.ts');
  });
});
