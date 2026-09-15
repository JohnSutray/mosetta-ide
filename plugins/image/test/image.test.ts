import { describe, expect, it } from 'vitest';
import { ImageKinds } from '../src/kinds.js';
import { SvgReader } from '../src/svg-facts.js';
import { ImageStore } from '../src/state.js';

describe('кого показываем картинкой', () => {
  const kinds = new ImageKinds();

  it('растровое — по расширению, регистр не важен', () => {
    expect(kinds.isRaster('a/b/logo.PNG')).toBe(true);
    expect(kinds.isRaster('icon.webp')).toBe(true);
    expect(kinds.isRaster('notes.md')).toBe(false);
    expect(kinds.isRaster('.png')).toBe(false);
  });

  it('SVG отдельно: он картинка, сделанная из текста', () => {
    expect(kinds.isSvg('sheep.svg')).toBe(true);
    expect(kinds.isRaster('sheep.svg')).toBe(false);
  });

  it('размер файла читается людьми, а не в байтах', () => {
    expect(kinds.size(512)).toBe('512 B');
    expect(kinds.size(2048)).toBe('2.0 KB');
    expect(kinds.size(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

describe('что можно сказать про SVG, не рисуя его', () => {
  const reader = new SvgReader();

  it('холст из viewBox, заявленный размер из корня, фигуры и цвета', () => {
    const facts = reader.facts(
      `<svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
         <rect x="1" y="1" width="14" height="14" fill="#cb3837"/>
         <path d="M4 4h8v8H4z" fill="currentColor"/>
       </svg>`,
    );
    expect(facts.box).toEqual({ width: 16, height: 16 });
    expect(facts.width).toBe('24');
    expect(facts.height).toBe('24');
    expect(facts.shapes).toBe(2);
    expect(facts.colors).toEqual(['#cb3837', 'currentColor']);
  });

  it('нет viewBox — так и говорим, а не выдумываем размер', () => {
    expect(reader.facts('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>').box).toBeNull();
  });

  it('атрибут берётся у КОРНЯ, а не у первой попавшейся фигуры', () => {
    const facts = reader.facts('<svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg>');
    expect(facts.width).toBeNull();
  });
});

describe('загрузка байтов', () => {
  function store(answers: Record<string, string>) {
    const calls: string[] = [];
    const wire = {
      bytes: async (path: string) => {
        calls.push(path);
        return { path, base64: answers[path] ?? '', bytes: 10, truncated: false };
      },
    };
    return { calls, image: new ImageStore(wire, (err) => String(err)) };
  }

  it('готовый адрес собирается из типа файла и байтов', async () => {
    const { image } = store({ 'a.png': 'QUJD' });
    image.load('a.png');
    await Promise.resolve();
    await Promise.resolve();
    expect(image.shown.value?.url).toBe('data:image/png;base64,QUJD');
  });

  it('тот же файл второй раз не перечитывается', async () => {
    const { calls, image } = store({ 'a.png': 'QUJD' });
    image.load('a.png');
    await Promise.resolve();
    await Promise.resolve();
    image.load('a.png');
    expect(calls).toEqual(['a.png']);
  });

  it('опоздавший ответ про старый файл не перебивает новый', async () => {
    type Answer = { path: string; base64: string; bytes: number; truncated: boolean };
    const held: Array<(value: Answer) => void> = [];
    const wire = {
      bytes: (path: string) =>
        path === 'slow.png'
          ? new Promise<Answer>((resolve) => held.push(resolve))
          : Promise.resolve({ path, base64: 'RkFTVA==', bytes: 4, truncated: false }),
    };
    const image = new ImageStore(wire, (err) => String(err));
    image.load('slow.png');
    image.load('fast.png');
    await Promise.resolve();
    await Promise.resolve();
    held[0]?.({ path: 'slow.png', base64: 'U0xPVw==', bytes: 4, truncated: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(image.shown.value?.path).toBe('fast.png');
    expect(image.shown.value?.url).toContain('RkFTVA==');
  });

  it('не прочиталось — говорим словами, а не показываем пустоту', () => {
    const image = new ImageStore(
      { bytes: () => Promise.reject(new Error('нет такого файла')) },
      (err) => (err instanceof Error ? err.message : String(err)),
    );
    image.load('gone.png');
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        expect(image.shown.value?.error).toBe('нет такого файла');
      });
  });
});
