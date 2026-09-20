import { describe, expect, it } from 'vitest';
import { BeforeRun, type BeforeRunServices } from '../src/unsaved.js';

/**
 * What is unsaved before a run.
 *
 * The rule is checked with no modal and no adapter: it is about ORDER — who is asked,
 * who is not asked at all, and what happens when the writing did not work out.
 */

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

describe('before a program is run', () => {
  it('there is nothing to save — it neither asks nor writes', async () => {
    const it_ = stand({ unsaved: [] });
    expect(await it_.before.ready()).toBe(true);
    expect(it_.asked).toEqual([]);
    expect(it_.saves).toBe(0);
  });

  it('it asks, listing the files, and saves on consent', async () => {
    const it_ = stand({ unsaved: ['src/a.ts', 'src/b.ts'] });
    expect(await it_.before.ready()).toBe(true);
    expect(it_.asked).toHaveLength(1);
    expect(it_.asked[0]?.text).toContain('src/a.ts');
    expect(it_.asked[0]?.text).toContain('src/b.ts');
    expect(it_.saves).toBe(1);
  });

  it('they refused — we do not run and we write nothing', async () => {
    const it_ = stand({ unsaved: ['src/a.ts'], answer: false });
    expect(await it_.before.ready()).toBe(false);
    expect(it_.saves).toBe(0);
  });

  it('with autosave there is no question — it writes silently and goes on', async () => {
    const it_ = stand({ unsaved: ['src/a.ts', 'src/b.ts'], autosaves: true });
    expect(await it_.before.ready()).toBe(true);
    expect(it_.asked).toEqual([]);
    expect(it_.saves).toBe(1);
  });

  it('it did not save — we do not run, and we name the files', async () => {
    const it_ = stand({ unsaved: ['src/a.ts'], autosaves: true, failed: ['src/a.ts'] });
    expect(await it_.before.ready()).toBe(false);
    expect(it_.complaints.join(' ')).toContain('src/a.ts');
  });

  it('a long list is cut VISIBLY: twelve listed, the rest as a number', async () => {
    const many = Array.from({ length: 15 }, (_, at) => `src/f${at}.ts`);
    const it_ = stand({ unsaved: many });
    await it_.before.ready();
    const text = it_.asked[0]?.text ?? '';
    expect(text).toContain('src/f11.ts');
    expect(text).not.toContain('src/f12.ts');
    expect(text).toContain('debug.unsaved.more {"count":3}');
  });
});
