import { describe, expect, it } from 'vitest';
import { BeforeRun, type BeforeRunServices } from '../src/unsaved.js';

interface Stand {
  before: BeforeRun;
  asked: Array<{ title: string; text: string; confirm: string }>;
  saves: number;
  complaints: string[];
}

function stand(options: {
  unsaved: string[];
  autosaves?: boolean;
  answer?: boolean;
  failed?: string[];
}): Stand {
  const state: Stand = { before: null as unknown as BeforeRun, asked: [], saves: 0, complaints: [] };
  const services: BeforeRunServices = {
    unsaved: async () => options.unsaved,
    autosaves: () => options.autosaves ?? false,
    save: async () => {
      state.saves += 1;
      return options.failed ?? [];
    },
    ask: async (question) => {
      state.asked.push(question);
      return options.answer ?? true;
    },
    complain: (message) => state.complaints.push(message),
    t: (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
  };
  state.before = new BeforeRun(services);
  return state;
}

describe('перед запуском программы', () => {
  it('нечего сохранять — не спрашивает и не пишет', async () => {
    const it_ = stand({ unsaved: [] });
    expect(await it_.before.ready()).toBe(true);
    expect(it_.asked).toEqual([]);
    expect(it_.saves).toBe(0);
  });

  it('спрашивает, перечисляя файлы, и по согласию сохраняет', async () => {
    const it_ = stand({ unsaved: ['src/a.ts', 'src/b.ts'] });
    expect(await it_.before.ready()).toBe(true);
    expect(it_.asked).toHaveLength(1);
    expect(it_.asked[0]?.text).toContain('src/a.ts');
    expect(it_.asked[0]?.text).toContain('src/b.ts');
    expect(it_.saves).toBe(1);
  });

  it('отказались — не запускаем и ничего не пишем', async () => {
    const it_ = stand({ unsaved: ['src/a.ts'], answer: false });
    expect(await it_.before.ready()).toBe(false);
    expect(it_.saves).toBe(0);
  });

  it('с автосохранением вопроса не бывает — молча пишет и идёт дальше', async () => {
    const it_ = stand({ unsaved: ['src/a.ts', 'src/b.ts'], autosaves: true });
    expect(await it_.before.ready()).toBe(true);
    expect(it_.asked).toEqual([]);
    expect(it_.saves).toBe(1);
  });

  it('не записалось — не запускаем и называем файлы', async () => {
    const it_ = stand({ unsaved: ['src/a.ts'], autosaves: true, failed: ['src/a.ts'] });
    expect(await it_.before.ready()).toBe(false);
    expect(it_.complaints.join(' ')).toContain('src/a.ts');
  });

  it('длинный список режется ВИДИМО: перечислено двенадцать, остальные числом', async () => {
    const many = Array.from({ length: 15 }, (_, at) => `src/f${at}.ts`);
    const it_ = stand({ unsaved: many });
    await it_.before.ready();
    const text = it_.asked[0]?.text ?? '';
    expect(text).toContain('src/f11.ts');
    expect(text).not.toContain('src/f12.ts');
    expect(text).toContain('debug.unsaved.more {"count":3}');
  });
});
