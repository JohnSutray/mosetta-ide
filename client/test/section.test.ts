import { describe, expect, it } from 'vitest';
import { sectionOf } from '@mosetta/ide-api/section';

/**
 * A settings section over its defaults: the user's file adds to it but does not break
 * it. A key of the wrong type falls back to its default; an unknown key stays; a
 * missing section means the defaults whole.
 */
describe('a settings section', () => {
  const defaults = { fontSize: 13, ligatures: false, args: [] as string[] };

  it('no section, or the settings have not arrived — the defaults', () => {
    expect(sectionOf(null, 'editor', defaults)).toEqual(defaults);
    expect(sectionOf({}, 'editor', defaults)).toEqual(defaults);
    expect(sectionOf({ editor: 'rubbish' }, 'editor', defaults)).toEqual(defaults);
  });

  it('the file covers the defaults, the extra stays', () => {
    const got = sectionOf({ editor: { fontSize: 15, extra: 1 } }, 'editor', defaults) as typeof defaults & { extra: number };
    expect(got.fontSize).toBe(15);
    expect(got.ligatures).toBe(false);
    expect(got.extra).toBe(1);
  });

  it('a key of the wrong type falls back to its default rather than breaking', () => {
    const got = sectionOf({ editor: { fontSize: '15', ligatures: null, args: 'x' } }, 'editor', defaults);
    expect(got).toEqual(defaults);
    expect(sectionOf({ editor: { args: ['-l'] } }, 'editor', defaults).args).toEqual(['-l']);
  });

  it('a nested value is covered BY KEY rather than whole', () => {
    const defaults = {
      startOnOpen: true,
      servers: { typescript: { enabled: true, command: '', preferences: { quotePreference: 'double' } } },
    };
    const merged = sectionOf({ lsp: { servers: { typescript: { preferences: { quotePreference: 'single' } } } } }, 'lsp', defaults);
    expect(merged.servers.typescript.enabled, 'the neighbouring key is still there').toBe(true);
    expect(merged.servers.typescript.preferences.quotePreference).toBe('single');
    expect(merged.startOnOpen).toBe(true);
  });

  it('a neighbour absent from the defaults arrives whole', () => {
    const merged = sectionOf(
      { lsp: { servers: { eslint: { enabled: true } } } },
      'lsp',
      { servers: { typescript: { enabled: true } } } as { servers: Record<string, { enabled: boolean }> },
    );
    expect(Object.keys(merged.servers).sort()).toEqual(['eslint', 'typescript']);
  });

  it('a list is replaced whole rather than merged', () => {
    const merged = sectionOf({ find: { masks: ['*.ts'] } }, 'find', { masks: ['*.js', '*.md'] });
    expect(merged.masks).toEqual(['*.ts']);
  });

  it('it does not touch the defaults themselves', () => {
    const got = sectionOf({ editor: { fontSize: 20 } }, 'editor', defaults);
    expect(got).not.toBe(defaults);
    expect(defaults.fontSize).toBe(13);
  });
});
