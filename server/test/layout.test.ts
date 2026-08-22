import { describe, expect, it } from 'vitest';
import { retype } from '../src/search/layout.js';

describe('раскладка', () => {
  it('русский набор читается английской раскладкой', () => {
    expect(retype('агтс')).toBe('func');
    expect(retype('ВШМ')).toBe('DIV');
    expect(retype('ыукмшсу')).toBe('service');
  });

  it('и наоборот', () => {
    expect(retype('ghbdtn')).toBe('привет');
  });

  it('без букв второго варианта нет', () => {
    expect(retype('123')).toBeNull();
    expect(retype('src/main.ts')).not.toBe('src/main.ts');
  });
});
