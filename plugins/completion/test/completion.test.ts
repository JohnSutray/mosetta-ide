import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import { Fuzzy } from '../src/fuzzy.js';
import { ChoiceHistory } from '../src/history.js';
import { Ranker } from '../src/ranker.js';
import { CompletionSession } from '../src/session.js';
import { BufferWords } from '../src/sources/buffer.js';
import { LspCompletions } from '../src/sources/lsp.js';
import { Postfix } from '../src/sources/postfix.js';
import type { Answer, Ask, Item, Source } from '../src/types.js';
import { matcher, textIndex } from '@mosetta/ide-plugin-search';

function askAt(marked: string, extra: Partial<Ask> = {}): Ask {
  const pos = marked.indexOf('|');
  const text = marked.replace('|', '');
  let from = pos;
  while (from > 0 && /[\w$]/.test(text[from - 1]!)) from -= 1;
  const before = text.slice(0, pos);
  return {
    path: 'a.ts',
    text,
    pos,
    from,
    line: before.split('\n').length - 1,
    character: pos - (before.lastIndexOf('\n') + 1),
    trigger: text[from - 1] === '.' ? '.' : null,
    explicit: false,
    ...extra,
  };
}

function ranker(store = signal<Record<string, number>>({})) {
  const history = new ChoiceHistory(store);
  return { ranker: new Ranker(new Fuzzy(matcher, textIndex), history), history };
}

const word = (label: string): Item => ({ label, kind: 'word', source: 'buffer' });
const member = (label: string, extra: Partial<Item> = {}): Item => ({ label, kind: 'method', source: 'lsp', ...extra });
const NO_WEIGHTS = new Map<string, number>();

describe('совпадение и порядок', () => {
  it('горбы находят имя, середина слова — нет', () => {
    const fuzzy = new Fuzzy(matcher, textIndex);
    expect(fuzzy.match('gEBI', 'getElementById')).not.toBe(null);
    expect(fuzzy.match('ebi', 'getElementById')).not.toBe(null);
    expect(fuzzy.match('ment', 'getElement')).toBe(null);
    expect(fuzzy.match('', 'anything')?.positions).toEqual([]);
  });

  it('начало имени подряд важнее разбросанного', () => {
    const { ranker: rank } = ranker();
    const out = rank.rank([member('toString'), member('stopTimer')], 'st', NO_WEIGHTS);
    expect(out.map((one) => one.item.label)).toEqual(['stopTimer', 'toString']);
  });

  it('ступень чекера: локальное раньше глобального при равном совпадении', () => {
    const { ranker: rank } = ranker();
    const out = rank.rank(
      [member('valueB', { rank: 5 }), member('valueA', { rank: 0 }), member('valueC', { rank: 0 })],
      'val',
      NO_WEIGHTS,
    );
    expect(out.map((one) => one.item.label)).toEqual(['valueA', 'valueC', 'valueB']);
  });

  it('одинаковые пункты от сервера получают разные ключи — выделение и строки не путаются', () => {
    const { ranker: rank } = ranker();
    const out = rank.rank(
      [
        { label: 'module', kind: 'keyword', source: 'lsp' },
        { label: 'module', kind: 'variable', source: 'lsp' },
        { label: 'module', kind: 'variable', source: 'lsp' },
      ],
      'mod',
      NO_WEIGHTS,
    );
    expect(new Set(out.map((one) => one.key)).size).toBe(3);
  });

  it('история поднимает то, что выбирали', () => {
    const { ranker: rank, history } = ranker();
    const items = [member('getAll'), member('getOne')];
    expect(rank.rank(items, 'get', NO_WEIGHTS)[0]!.item.label).toBe('getAll');
    history.chose('getOne');
    history.chose('getOne');
    expect(rank.rank(items, 'get', NO_WEIGHTS)[0]!.item.label).toBe('getOne');
  });

  it('выбор уходит на сервер, а его число — точное: дважды не засчитывается (правка 10.09)', () => {
    const store = signal<Record<string, number>>({});
    const sent: string[] = [];
    const history = new ChoiceHistory(store, (label) => sent.push(label));
    history.chose('log');
    expect(sent).toEqual(['log']);
    expect(store.value).toEqual({ log: 1 });
    history.heard('log', 3);
    expect(store.value).toEqual({ log: 3 });
    history.replace({ bind: 2 });
    expect(history.bonus('log')).toBe(0);
    expect(history.bonus('bind')).toBeGreaterThan(0);
  });
});

describe('сеанс', () => {
  function late() {
    let answer: (value: Answer) => void = () => undefined;
    const source: Source = {
      id: 'lsp',
      weight: 10,
      items: () => new Promise<Answer>((resolve) => (answer = resolve)),
    };
    return { source, answer: (value: Answer) => answer(value) };
  }

  it('первый кадр — из синхронных; язык догоняет и вытесняет одноимённое слово', async () => {
    const lsp = late();
    const buffer: Source = { id: 'buffer', weight: -20, items: () => ({ items: [word('render'), word('return')] }) };
    const session = new CompletionSession(ranker().ranker, () => [lsp.source, buffer]);
    session.start(askAt('re|'));
    expect(session.visible.value).toBe(true);
    expect(session.loading.value).toBe(true);
    expect(session.items.value.map((one) => one.item.kind)).toEqual(['word', 'word']);

    lsp.answer({ items: [member('render')] });
    await Promise.resolve();
    const labels = session.items.value.map((one) => `${one.item.label}:${one.item.kind}`);
    expect(labels).toEqual(['render:method', 'return:word']);
    expect(session.loading.value).toBe(false);
  });

  it('опоздавший ответ не переставляет выделение, если по списку ходили или он провисел', async () => {
    let clock = 0;
    const lsp = late();
    const buffer: Source = { id: 'buffer', weight: -20, items: () => ({ items: [word('alpha'), word('alsoWord')] }) };
    const session = new CompletionSession(ranker().ranker, () => [lsp.source, buffer], () => clock);
    session.start(askAt('al|'));
    session.move(1);
    expect(session.current()?.item.label).toBe('alsoWord');
    lsp.answer({ items: [member('alert')] });
    await Promise.resolve();
    expect(session.items.value[0]!.item.label).toBe('alert');
    expect(session.current()?.item.label).toBe('alsoWord');

    session.refine(askAt('als|'));
    expect(session.selected.value).toBe(0);
    expect(session.current()?.item.label).toBe('alsoWord');

    const lsp2 = late();
    const session2 = new CompletionSession(ranker().ranker, () => [lsp2.source, buffer], () => clock);
    session2.start(askAt('al|'));
    clock = 500;
    lsp2.answer({ items: [member('alert')] });
    await Promise.resolve();
    expect(session2.current()?.item.label).toBe('alpha');
  });

  it('ответ не успели прочитать — лучшее встаёт наверх', async () => {
    const lsp = late();
    const buffer: Source = { id: 'buffer', weight: -20, items: () => ({ items: [word('alpha')] }) };
    const session = new CompletionSession(ranker().ranker, () => [lsp.source, buffer], () => 0);
    session.start(askAt('al|'));
    lsp.answer({ items: [member('alert')] });
    await Promise.resolve();
    expect(session.current()?.item.label).toBe('alert');
  });

  it('неполный ответ переспрашивается на каждую букву, полный — нет', () => {
    let asked = 0;
    let whole = 0;
    const partial: Source = {
      id: 'a',
      weight: 0,
      items: () => {
        asked += 1;
        return { items: [member('abc')], incomplete: true };
      },
    };
    const full: Source = {
      id: 'b',
      weight: 0,
      items: () => {
        whole += 1;
        return { items: [member('abd')] };
      },
    };
    const session = new CompletionSession(ranker().ranker, () => [partial, full]);
    session.start(askAt('a|'));
    session.refine(askAt('ab|'));
    expect([asked, whole]).toEqual([2, 1]);
  });

  it('ответ на старый вопрос выбрасывается, закрытие гасит всё', async () => {
    const lsp = late();
    const session = new CompletionSession(ranker().ranker, () => [lsp.source]);
    session.start(askAt('x|'));
    session.close();
    lsp.answer({ items: [member('xyz')] });
    await Promise.resolve();
    expect(session.visible.value).toBe(false);
    expect(session.items.value).toEqual([]);
  });

  it('вызов клавишей не молчит: пока думают — виден пустым, пусто — говорит и закрывается', async () => {
    const lsp = late();
    const told: string[] = [];
    const session = new CompletionSession(ranker().ranker, () => [lsp.source], () => 0, (what) => told.push(what));
    session.start(askAt('zz|', { explicit: true }));
    expect(session.visible.value).toBe(true);
    expect(session.listed.value).toBe(false);
    lsp.answer({ items: [] });
    await Promise.resolve();
    expect(told).toEqual(['empty']);
    expect(session.active.value).toBe(false);

    const quiet = late();
    const typed = new CompletionSession(ranker().ranker, () => [quiet.source], () => 0, (what) => told.push(what));
    typed.start(askAt('zz|'));
    expect(typed.visible.value).toBe(false);
    quiet.answer({ items: [] });
    await Promise.resolve();
    expect(told).toEqual(['empty']);
  });

  it('упавший источник говорит, чей и что; остальные показывают своё', async () => {
    const told: string[] = [];
    const broken: Source = { id: 'lsp', weight: 10, items: () => Promise.reject(new Error('Debug Failure')) };
    const buffer: Source = { id: 'buffer', weight: -20, items: () => ({ items: [word('render')] }) };
    const session = new CompletionSession(ranker().ranker, () => [broken, buffer], () => 0, (what, detail) =>
      told.push(`${what} ${detail ?? ''}`.trim()),
    );
    session.start(askAt('re|'));
    await Promise.resolve();
    await Promise.resolve();
    expect(told).toEqual(['failed lsp: Debug Failure']);
    expect(session.items.value.map((one) => one.item.label)).toEqual(['render']);
    expect(session.loading.value).toBe(false);
  });

  it('документация дочитывается для выделенного и один раз', async () => {
    let resolved = 0;
    const item = member('run', {
      resolve: async () => {
        resolved += 1;
        return { detail: 'run(): void', edits: [] };
      },
    });
    const source: Source = { id: 'lsp', weight: 0, items: () => ({ items: [item] }) };
    const session = new CompletionSession(ranker().ranker, () => [source]);
    session.start(askAt('r|'));
    await new Promise((done) => setTimeout(done, 0));
    expect(session.details.value?.detail).toBe('run(): void');
    await session.detailsOf(session.current()!);
    expect(resolved).toBe(1);
    expect(session.settled(session.current()!.key)?.detail).toBe('run(): void');
  });
});

describe('источники', () => {
  it('слова буфера: без слова под кареткой, коротких и повторов', () => {
    const buffer = new BufferWords(() => true);
    const labels = buffer.items(askAt('render(); return renderer; ab; render; ren|')).items.map((one) => one.label);
    expect(labels).toEqual(['render', 'return', 'renderer']);
  });

  it('после точки в типизированном файле слова молчат — члены скажет сервер', () => {
    expect(new BufferWords(() => true).items(askAt('word foo.|')).items).toEqual([]);
    expect(new BufferWords(() => false).items(askAt('word foo.|', { path: 'a.md' })).items.length).toBe(2);
  });

  it('постфикс забирает выражение слева и ставит каретку', () => {
    const postfix = new Postfix();
    const ask = askAt('  user.name(a[0]).lo|');
    const log = postfix.items(ask).items.find((one) => one.label === 'log')!;
    expect(ask.text.slice(log.from!, ask.pos)).toBe('user.name(a[0]).lo');
    expect(log.insert).toBe('console.log(user.name(a[0]))');
    expect(log.caret).toBe(log.insert!.length);

    const branch = postfix.items(askAt('  ok.|')).items.find((one) => one.label === 'if')!;
    expect(branch.insert).toBe('if (ok) {\n    \n  }');
    expect(branch.insert!.slice(0, branch.caret)).toBe('if (ok) {\n    ');
  });

  it('постфикс молчит у дроби, строки и вне скриптов', () => {
    const postfix = new Postfix();
    expect(postfix.items(askAt('1.|')).items).toEqual([]);
    expect(postfix.items(askAt("'a'.|")).items).toEqual([]);
    expect(postfix.items(askAt('foo.|', { path: 'a.md' })).items).toEqual([]);
    expect(postfix.items(askAt('foo|')).items).toEqual([]);
  });

  it('языковой сервер: правки дописываются до вопроса, ступень — из sortText', async () => {
    const calls: string[] = [];
    const lsp = new LspCompletions(
      {
        serves: (path) => path.endsWith('.ts'),
        complete: async (_path, line, character, trigger) => {
          calls.push(`ask ${line}:${character} ${trigger ?? '-'}`);
          return {
            incomplete: false,
            items: [
              { label: 'length', kind: 'property', insert: 'length', sortText: '11', raw: {} },
              {
                label: 'at',
                kind: 'method',
                insert: '?.at',
                sortText: '11',
                range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } },
                raw: {},
              },
            ],
          };
        },
        resolveCompletion: async () => ({ edits: [] }),
      },
      async () => {
        calls.push('flush');
      },
    );
    const ask = askAt('x\nxs.|');
    const answer = await lsp.items(ask);
    expect(calls).toEqual(['flush', 'ask 1:3 .']);
    expect(answer.items[0]!.rank).toBe(1);
    expect(answer.items[0]!.from).toBeUndefined();
    expect(answer.items[1]!.from).toBe(ask.pos - 1);
    expect(lsp.rank('16')).toBe(6);
    expect(lsp.rank('z11')).toBe(5);
    expect(lsp.items(askAt('a|', { path: 'a.md' }))).toEqual({ items: [] });
  });
});
