import { describe, expect, it } from 'vitest';
import { Markdown } from '../src/markdown.js';
import { MarkdownImages } from '../src/images.js';

/**
 * Parsing markup. Pure mechanics: no DOM, no network — so it is checked by a test
 * rather than by eye. The cases checked are the ones OUR texts are made of: the README,
 * the decision records and the diary.
 */
const md = new Markdown();

describe('blocks', () => {
  it('headings, paragraphs and a rule', () => {
    const blocks = md.blocks('# One\n\ntext\none more line\n\n---\n\n## Two ##');
    expect(blocks.map((one) => one.kind)).toEqual(['heading', 'paragraph', 'rule', 'heading']);
    expect(blocks[0]).toMatchObject({ level: 1 });
    expect(blocks[3]).toMatchObject({ level: 2 });
    expect((blocks[3] as { parts: Array<{ text: string }> }).parts[0]!.text).toBe('Two');
  });

  it('a code fence: there is no markup inside it at all', () => {
    const blocks = md.blocks('```ts\nconst a = `**not bold**`;\n```');
    expect(blocks[0]).toEqual({ kind: 'code', lang: 'ts', text: 'const a = `**not bold**`;' });
  });

  it('an unclosed fence is read to the end of the file rather than lost', () => {
    const blocks = md.blocks('```\none\ntwo');
    expect(blocks[0]).toMatchObject({ kind: 'code', text: 'one\ntwo' });
  });

  it('a list, a nested list and a continued item', () => {
    const blocks = md.blocks('- one\n- two\n  - nested\n- three');
    expect(blocks).toHaveLength(1);
    const list = blocks[0] as { kind: 'list'; ordered: boolean; items: Array<Array<{ kind: string }>> };
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(3);
    expect(list.items[1]!.map((one) => one.kind)).toEqual(['paragraph', 'list']);
  });

  it('a numbered list is its own and does not mix with a bulleted one', () => {
    const blocks = md.blocks('1. one\n2. two\n\n- a\n- b');
    expect(blocks.map((one) => (one as { ordered?: boolean }).ordered)).toEqual([true, false]);
  });

  it('a quote is parsed as text inside a quote', () => {
    const blocks = md.blocks('> # a heading in a quote\n> and a paragraph');
    const quote = blocks[0] as { kind: 'quote'; blocks: Array<{ kind: string }> };
    expect(quote.kind).toBe('quote');
    expect(quote.blocks.map((one) => one.kind)).toEqual(['heading', 'paragraph']);
  });

  it('a table: a head, a separator, rows', () => {
    const blocks = md.blocks('| Feature | Decision |\n|---|---|\n| one | 0234 |\n| two | 0233 |');
    const table = blocks[0] as { kind: 'table'; head: unknown[]; rows: unknown[][] };
    expect(table.kind).toBe('table');
    expect(table.head).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
  });

  it('a line with a vertical bar and no separator is just a paragraph', () => {
    expect(md.blocks('one | two').map((one) => one.kind)).toEqual(['paragraph']);
  });
});

describe('inline markup', () => {
  it('code, bold, italic, strikethrough', () => {
    expect(md.inline('`code` **bold** *ital* ~~no~~').map((one) => one.kind)).toEqual([
      'code',
      'text',
      'strong',
      'text',
      'em',
      'text',
      'strike',
    ]);
  });

  it('a star or an underscore inside a word does not make italics', () => {
    expect(md.inline('snake_case_name').map((one) => one.kind)).toEqual(['text']);
    expect(md.inline('a*b*c').map((one) => one.kind)).toEqual(['text']);
  });

  it('a link and an image differ by the exclamation mark', () => {
    const parts = md.inline('[name](/path) and ![alt](/pic.png)');
    expect(parts[0]).toMatchObject({ kind: 'link', href: '/path' });
    expect(parts[2]).toMatchObject({ kind: 'image', src: '/pic.png', alt: 'alt' });
  });

  it('there is no markup inside code', () => {
    expect(md.inline('`**not bold**`')).toEqual([{ kind: 'code', text: '**not bold**' }]);
  });

  it('a bare link in angle brackets', () => {
    expect(md.inline('<https://example.com>')[0]).toMatchObject({ kind: 'link', href: 'https://example.com' });
  });
});

/**
 * An image's path is computed FROM THE FILE: in markup it is written relative to it,
 * while the page lives at the application's address. The arithmetic is pure — hence a
 * test rather than "we will have a look".
 */
describe('image paths', () => {
  const images = new MarkdownImages({ bytes: async () => ({ path: '', base64: '', bytes: 0, truncated: false }) });

  it('next to it, deeper, and one floor up', () => {
    expect(images.resolve('pic.png', 'docs/readme.md')).toBe('docs/pic.png');
    expect(images.resolve('./img/pic.png', 'docs/readme.md')).toBe('docs/img/pic.png');
    expect(images.resolve('../pic.png', 'docs/diary/one.md')).toBe('docs/pic.png');
  });

  it('from the project root is a path with no leading slash', () => {
    expect(images.resolve('/assets/pic.png', 'docs/readme.md')).toBe('assets/pic.png');
  });

  it('an external link is handed over as it is: the build badges in a README are exactly that', () => {
    expect(images.source('https://example.com/badge.svg', 'readme.md').value).toBe('https://example.com/badge.svg');
  });

  it('an unfamiliar extension is not read at all', () => {
    expect(images.source('data.bin', 'readme.md').value).toBeNull();
  });
});
