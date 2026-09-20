import { describe, expect, it } from 'vitest';
import { ImageKinds } from '../src/kinds.js';
import { SvgReader } from '../src/svg-facts.js';
import { ImageStore } from '../src/state.js';

/**
 * The image viewer. What is checked is what can be checked without a screen: which
 * files we take on, what we say about an SVG, and how loading behaves when answers
 * arrive in a different order from the one they were asked in.
 */

describe('whom we show as an image', () => {
  const kinds = new ImageKinds();

  it('raster by extension, and the case does not matter', () => {
    expect(kinds.isRaster('a/b/logo.PNG')).toBe(true);
    expect(kinds.isRaster('icon.webp')).toBe(true);
    expect(kinds.isRaster('notes.md')).toBe(false);
    expect(kinds.isRaster('.png')).toBe(false);
  });

  it('SVG apart: it is an image made of text', () => {
    expect(kinds.isSvg('sheep.svg')).toBe(true);
    expect(kinds.isRaster('sheep.svg')).toBe(false);
  });

  it('a file\'s size is read by people rather than in bytes', () => {
    expect(kinds.size(512)).toBe('512 B');
    expect(kinds.size(2048)).toBe('2.0 KB');
    expect(kinds.size(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

describe('what can be said about an SVG without drawing it', () => {
  const reader = new SvgReader();

  it('the canvas from viewBox, the declared size from the root, the shapes and the colours', () => {
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

  it('no viewBox — we say so rather than inventing a size', () => {
    expect(reader.facts('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>').box).toBeNull();
  });

  it('the attribute is taken from the ROOT rather than from the first shape that turns up', () => {
    const facts = reader.facts('<svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg>');
    expect(facts.width).toBeNull();
  });
});

describe('loading the bytes', () => {
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

  it('a ready address is assembled from the file\'s type and its bytes', async () => {
    const { image } = store({ 'a.png': 'QUJD' });
    image.load('a.png');
    await Promise.resolve();
    await Promise.resolve();
    expect(image.shown.value?.url).toBe('data:image/png;base64,QUJD');
  });

  it('the same file is not re-read a second time', async () => {
    const { calls, image } = store({ 'a.png': 'QUJD' });
    image.load('a.png');
    await Promise.resolve();
    await Promise.resolve();
    image.load('a.png');
    expect(calls).toEqual(['a.png']);
  });

  it('a late answer about the old file does not override the new one', async () => {
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

  it('it did not read — we say so in words rather than showing emptiness', () => {
    const image = new ImageStore(
      { bytes: () => Promise.reject(new Error('no such file')) },
      (err) => (err instanceof Error ? err.message : String(err)),
    );
    image.load('gone.png');
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        expect(image.shown.value?.error).toBe('no such file');
      });
  });
});
