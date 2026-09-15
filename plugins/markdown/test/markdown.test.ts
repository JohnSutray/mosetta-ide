import { describe, expect, it } from 'vitest';
import { Markdown } from '../src/markdown.js';
import { MarkdownImages } from '../src/images.js';

const md = new Markdown();

describe('блоки', () => {
  it('заголовки, абзацы и черта', () => {
    const blocks = md.blocks('# Раз\n\nтекст\nещё строка\n\n---\n\n## Два ##');
    expect(blocks.map((one) => one.kind)).toEqual(['heading', 'paragraph', 'rule', 'heading']);
    expect(blocks[0]).toMatchObject({ level: 1 });
    expect(blocks[3]).toMatchObject({ level: 2 });
    expect((blocks[3] as { parts: Array<{ text: string }> }).parts[0]!.text).toBe('Два');
  });

  it('забор кода: внутри разметки нет вовсе', () => {
    const blocks = md.blocks('```ts\nconst a = `**не жирное**`;\n```');
    expect(blocks[0]).toEqual({ kind: 'code', lang: 'ts', text: 'const a = `**не жирное**`;' });
  });

  it('незакрытый забор дочитывается до конца файла, а не теряется', () => {
    const blocks = md.blocks('```\nраз\nдва');
    expect(blocks[0]).toMatchObject({ kind: 'code', text: 'раз\nдва' });
  });

  it('список, вложенный список и продолжение пункта', () => {
    const blocks = md.blocks('- раз\n- два\n  - вложенный\n- три');
    expect(blocks).toHaveLength(1);
    const list = blocks[0] as { kind: 'list'; ordered: boolean; items: Array<Array<{ kind: string }>> };
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(3);
    expect(list.items[1]!.map((one) => one.kind)).toEqual(['paragraph', 'list']);
  });

  it('нумерованный список — свой, не смешивается с маркированным', () => {
    const blocks = md.blocks('1. раз\n2. два\n\n- а\n- б');
    expect(blocks.map((one) => (one as { ordered?: boolean }).ordered)).toEqual([true, false]);
  });

  it('цитата разбирается как текст внутри цитаты', () => {
    const blocks = md.blocks('> # заголовок в цитате\n> и абзац');
    const quote = blocks[0] as { kind: 'quote'; blocks: Array<{ kind: string }> };
    expect(quote.kind).toBe('quote');
    expect(quote.blocks.map((one) => one.kind)).toEqual(['heading', 'paragraph']);
  });

  it('таблица: шапка, разделитель, строки', () => {
    const blocks = md.blocks('| Фича | ADR |\n|---|---|\n| раз | 0234 |\n| два | 0233 |');
    const table = blocks[0] as { kind: 'table'; head: unknown[]; rows: unknown[][] };
    expect(table.kind).toBe('table');
    expect(table.head).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
  });

  it('строка с вертикальной чертой без разделителя — просто абзац', () => {
    expect(md.blocks('раз | два').map((one) => one.kind)).toEqual(['paragraph']);
  });
});

describe('строчная разметка', () => {
  it('код, жирное, курсив, зачёркнутое', () => {
    expect(md.inline('`код` **жир** *кур* ~~нет~~').map((one) => one.kind)).toEqual([
      'code',
      'text',
      'strong',
      'text',
      'em',
      'text',
      'strike',
    ]);
  });

  it('звёздочка и подчёркивание внутри слова курсивом не делаются', () => {
    expect(md.inline('snake_case_name').map((one) => one.kind)).toEqual(['text']);
    expect(md.inline('a*b*c').map((one) => one.kind)).toEqual(['text']);
  });

  it('ссылка и картинка различаются восклицательным знаком', () => {
    const parts = md.inline('[имя](/путь) и ![альт](/pic.png)');
    expect(parts[0]).toMatchObject({ kind: 'link', href: '/путь' });
    expect(parts[2]).toMatchObject({ kind: 'image', src: '/pic.png', alt: 'альт' });
  });

  it('внутри кода разметки нет', () => {
    expect(md.inline('`**не жирное**`')).toEqual([{ kind: 'code', text: '**не жирное**' }]);
  });

  it('голая ссылка в угловых скобках', () => {
    expect(md.inline('<https://example.com>')[0]).toMatchObject({ kind: 'link', href: 'https://example.com' });
  });
});

describe('пути картинок', () => {
  const images = new MarkdownImages({ bytes: async () => ({ path: '', base64: '', bytes: 0, truncated: false }) });

  it('рядом, глубже и на этаж вверх', () => {
    expect(images.resolve('pic.png', 'docs/readme.md')).toBe('docs/pic.png');
    expect(images.resolve('./img/pic.png', 'docs/readme.md')).toBe('docs/img/pic.png');
    expect(images.resolve('../pic.png', 'docs/diary/один.md')).toBe('docs/pic.png');
  });

  it('от корня проекта — это путь без ведущей косой', () => {
    expect(images.resolve('/assets/pic.png', 'docs/readme.md')).toBe('assets/pic.png');
  });

  it('внешнюю ссылку отдаём как есть: значки сборки в README именно такие', () => {
    expect(images.source('https://example.com/badge.svg', 'readme.md').value).toBe('https://example.com/badge.svg');
  });

  it('незнакомое расширение не читаем вовсе', () => {
    expect(images.source('data.bin', 'readme.md').value).toBeNull();
  });
});
