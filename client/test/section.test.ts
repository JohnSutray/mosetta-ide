import { describe, expect, it } from 'vitest';
import { sectionOf } from '@mosetta/ide-api/section';

describe('раздел настроек', () => {
  const defaults = { fontSize: 13, ligatures: false, args: [] as string[] };

  it('нет раздела или настройки не приехали — умолчания', () => {
    expect(sectionOf(null, 'editor', defaults)).toEqual(defaults);
    expect(sectionOf({}, 'editor', defaults)).toEqual(defaults);
    expect(sectionOf({ editor: 'мусор' }, 'editor', defaults)).toEqual(defaults);
  });

  it('файл накрывает умолчания, лишнее остаётся', () => {
    const got = sectionOf({ editor: { fontSize: 15, extra: 1 } }, 'editor', defaults) as typeof defaults & { extra: number };
    expect(got.fontSize).toBe(15);
    expect(got.ligatures).toBe(false);
    expect(got.extra).toBe(1);
  });

  it('ключ не того типа — умолчание, а не поломка', () => {
    const got = sectionOf({ editor: { fontSize: '15', ligatures: null, args: 'x' } }, 'editor', defaults);
    expect(got).toEqual(defaults);
    expect(sectionOf({ editor: { args: ['-l'] } }, 'editor', defaults).args).toEqual(['-l']);
  });

  it('вложенное накрывается ПО КЛЮЧУ, а не целиком', () => {
    const defaults = {
      startOnOpen: true,
      servers: { typescript: { enabled: true, command: '', preferences: { quotePreference: 'double' } } },
    };
    const merged = sectionOf({ lsp: { servers: { typescript: { preferences: { quotePreference: 'single' } } } } }, 'lsp', defaults);
    expect(merged.servers.typescript.enabled, 'соседний ключ на месте').toBe(true);
    expect(merged.servers.typescript.preferences.quotePreference).toBe('single');
    expect(merged.startOnOpen).toBe(true);
  });

  it('сосед, которого нет в умолчаниях, приезжает целиком', () => {
    const merged = sectionOf(
      { lsp: { servers: { eslint: { enabled: true } } } },
      'lsp',
      { servers: { typescript: { enabled: true } } } as { servers: Record<string, { enabled: boolean }> },
    );
    expect(Object.keys(merged.servers).sort()).toEqual(['eslint', 'typescript']);
  });

  it('список заменяется целиком, а не сливается', () => {
    const merged = sectionOf({ find: { masks: ['*.ts'] } }, 'find', { masks: ['*.js', '*.md'] });
    expect(merged.masks).toEqual(['*.ts']);
  });

  it('не трогает сами умолчания', () => {
    const got = sectionOf({ editor: { fontSize: 20 } }, 'editor', defaults);
    expect(got).not.toBe(defaults);
    expect(defaults.fontSize).toBe(13);
  });
});
