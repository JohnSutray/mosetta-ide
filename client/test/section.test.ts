import { describe, expect, it } from 'vitest';
import { sectionOf } from '@ide/api/section';

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

  it('не трогает сами умолчания', () => {
    const got = sectionOf({ editor: { fontSize: 20 } }, 'editor', defaults);
    expect(got).not.toBe(defaults);
    expect(defaults.fontSize).toBe(13);
  });
});
