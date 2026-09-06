import { describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';

describe('раскладка', () => {
  it('русский набор читается английской раскладкой', () => {
    expect(layout.retype('агтс')).toBe('func');
    expect(layout.retype('ВШМ')).toBe('DIV');
    expect(layout.retype('ыукмшсу')).toBe('service');
  });

  it('и наоборот', () => {
    expect(layout.retype('ghbdtn')).toBe('привет');
  });

  it('без букв второго варианта нет', () => {
    expect(layout.retype('123')).toBeNull();
    expect(layout.retype('src/main.ts')).not.toBe('src/main.ts');
  });
});
