import { describe, expect, it } from 'vitest';
import { LineDiff } from '@mosetta/ide-plugin-code';
import { Diff } from '../src/diff.js';

const lineDiff = new LineDiff();

function raise(before: string | null, now: string, options: { fail?: string } = {}) {
  return new Diff(
    async () => ({ text: before }),
    async () => {
      if (options.fail) throw new Error(options.fail);
      return { text: now };
    },
    (a, b) => lineDiff.steps(a, b),
    (text) => lineDiff.split(text),
  );
}

function shown(diff: Diff): string[] {
  return diff.blocks().flatMap((block) =>
    block.kind === 'fold' ? [`…${block.lines}`] : block.rows.map((row) => `${sign(row.kind)}${row.text}`),
  );
}

function sign(kind: 'same' | 'del' | 'ins'): string {
  return kind === 'ins' ? '+' : kind === 'del' ? '-' : ' ';
}

describe('дифф файла', () => {
  it('добавленная строка называет номер только справа', async () => {
    const diff = raise('a\nb\n', 'a\nnew\nb\n');
    await diff.show('src/a.ts');

    const rows = diff.rows();
    expect(rows.map((row) => `${sign(row.kind)}${row.text}`)).toEqual([' a', '+new', ' b']);
    expect(rows[1]).toMatchObject({ old: null, now: 2 });
    expect(diff.count()).toEqual({ added: 1, removed: 0 });
  });

  it('новый файл — это весь текст добавленным, а не правка пустой строки', async () => {
    const diff = raise(null, 'one\ntwo\n');
    await diff.show('src/new.ts');
    expect(shown(diff)).toEqual(['+one', '+two']);
  });

  it('удалённый файл не спрашивает память: пустота там — ответ, а не отказ', async () => {
    const diff = raise('gone\n', '', { fail: 'Документ не открыт' });
    await diff.show('src/gone.ts', 'deleted');
    expect(diff.error.value, 'ошибки быть не должно: файла и правда нет').toBe('');
    expect(shown(diff)).toEqual(['-gone']);
  });

  it('файл не в памяти — это ошибка вслух, а не пустой дифф', async () => {
    const diff = raise('was\n', '', { fail: 'Документ не открыт: src/big.bin' });
    await diff.show('src/big.bin');
    expect(diff.error.value).toContain('src/big.bin');
  });

  it('неизменная середина сворачивается и НАЗЫВАЕТ, сколько спрятала', async () => {
    const before = ['head', ...filler(20), 'tail'].join('\n');
    const after = ['HEAD', ...filler(20), 'TAIL'].join('\n');
    const diff = raise(before, after);
    await diff.show('src/long.ts');

    expect(shown(diff)).toEqual([
      '-head',
      '+HEAD',
      ' l1',
      ' l2',
      ' l3',
      '…14',
      ' l18',
      ' l19',
      ' l20',
      '-tail',
      '+TAIL',
    ]);
  });

  it('свёртка разворачивается щелчком и сворачивается обратно', async () => {
    const diff = raise(['head', ...filler(20)].join('\n'), ['HEAD', ...filler(20)].join('\n'));
    await diff.show('src/long.ts');
    expect(shown(diff)).toContain('…17');

    diff.toggleFold(0);
    expect(shown(diff)).not.toContain('…17');
    expect(shown(diff)).toContain(' l20');

    diff.toggleFold(0);
    expect(shown(diff)).toContain('…17');
  });

  it('опоздавший ответ не переставляет показанное', async () => {
    let answer = (_text: string) => {};
    const diff = new Diff(
      async () => ({ text: 'was\n' }),
      (path) =>
        new Promise((resolve) => {
          if (path === 'src/slow.ts') answer = (text) => resolve({ text });
          else resolve({ text: 'fast\n' });
        }),
      (a, b) => lineDiff.steps(a, b),
      (text) => lineDiff.split(text),
    );

    const slow = diff.show('src/slow.ts');
    await diff.show('src/fast.ts');
    answer('slow\n');
    await slow;

    expect(diff.path.value).toBe('src/fast.ts');
    expect(diff.after.value, 'ответ про другой файл не имеет права дописаться').toBe('fast\n');
  });

  it('в две колонки правка встаёт парой: слева было, справа стало', async () => {
    const diff = raise('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
    await diff.show('src/a.ts');

    const pairs = diff.sides().flatMap((block) => (block.kind === 'fold' ? [] : block.pairs));
    expect(pairs.map((pair) => [pair.left?.text ?? null, pair.right?.text ?? null])).toEqual([
      ['one', 'one'],
      ['two', 'TWO'],
      ['three', 'three'],
    ]);
  });

  it('стороны разной длины: у короткой остаётся пустое место, а не сдвиг', async () => {
    const diff = raise('gone\n', 'a\nb\nc\n');
    await diff.show('src/a.ts');

    const pairs = diff.sides().flatMap((block) => (block.kind === 'fold' ? [] : block.pairs));
    expect(pairs.map((pair) => [pair.left?.text ?? null, pair.right?.text ?? null])).toEqual([
      ['gone', 'a'],
      [null, 'b'],
      [null, 'c'],
    ]);
  });

  it('свёртки у двух колонок те же самые: вид не меняет, что спрятано', async () => {
    const diff = raise(['head', ...filler(20), 'tail'].join('\n'), ['HEAD', ...filler(20), 'TAIL'].join('\n'));
    await diff.show('src/long.ts');

    const folds = (blocks: Array<{ kind: string; lines?: number }>) =>
      blocks.filter((block) => block.kind === 'fold').map((block) => block.lines);
    expect(folds(diff.sides())).toEqual(folds(diff.blocks()));
  });

  it('закрытый дифф забывает файл: следующее открытие — не продолжение прошлого', async () => {
    const diff = raise('a\n', 'b\n');
    await diff.show('src/a.ts');
    diff.close();
    expect(diff.open.value).toBe(false);
    expect(diff.path.value).toBe(null);
  });
});

describe('показ идёт за снимком (правка 18.09)', () => {
  const diff = new Diff(
    async () => ({ text: '' }),
    async () => ({ text: '' }),
    () => [],
    (text) => (text === '' ? [] : text.split('\n')),
  );
  const key = (state: string, path: string) => `${state}\u0000${path}`;

  it('файл откатили — показывать нечего, оверлей закрывается', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('clean', 'a.ts'))).toEqual({ do: 'close' });
  });

  it('файл изменился иначе — перечитываем стороны', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('conflict', 'a.ts'))).toEqual({
      do: 'show',
      path: 'a.ts',
      state: 'other',
    });
    expect(diff.decide(key('modified', 'a.ts'), key('deleted', 'a.ts'))).toMatchObject({ state: 'deleted' });
  });

  it('щелчок по соседней строке сам себе показ: второго чтения не заводим', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('modified', 'b.ts'))).toEqual({ do: 'skip' });
  });

  it('открытие и закрытие — не смена состояния', () => {
    expect(diff.decide('', key('modified', 'a.ts'))).toEqual({ do: 'skip' });
    expect(diff.decide(key('modified', 'a.ts'), '')).toEqual({ do: 'skip' });
  });

  it('снимок перечитали, а файл тот же — ничего не делаем', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('modified', 'a.ts'))).toEqual({ do: 'skip' });
  });
});

function filler(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `l${i + 1}`);
}

describe('откат одного куска (правка 18.09)', () => {
  it('возвращает строки куска как в коммите, остальное не трогает', async () => {
    const diff = raise('один\nдва\nтри\nчетыре\n', 'один\nДВА\nтри\nЧЕТЫРЕ\n');
    await diff.show('a.ts');
    expect(diff.revertedText(0)).toBe('один\nдва\nтри\nЧЕТЫРЕ\n');
    expect(diff.revertedText(1)).toBe('один\nДВА\nтри\nчетыре\n');
  });

  it('добавленные строки исчезают, убранные возвращаются', async () => {
    const added = raise('один\nдва\n', 'один\nновая\nдва\n');
    await added.show('a.ts');
    expect(added.revertedText(0)).toBe('один\nдва\n');

    const removed = raise('один\nдва\nтри\n', 'один\nтри\n');
    await removed.show('a.ts');
    expect(removed.revertedText(0)).toBe('один\nдва\nтри\n');
  });

  it('хвостовой перевод строки остаётся на месте', async () => {
    const diff = raise('один\nдва\n', 'один\nДВА\n');
    await diff.show('a.ts');
    expect(diff.revertedText(0)).toBe('один\nдва\n');
  });

  it('куска с таким номером нет — не выдумываем текст', async () => {
    const diff = raise('один\n', 'один\n');
    await diff.show('a.ts');
    expect(diff.revertedText(0)).toBe(null);
  });
});
