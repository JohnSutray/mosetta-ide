import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DaemonPlugin from '../src/client.js';

const NAME = '@mosetta/ide-plugin-daemon';

interface Chip {
  text: unknown;
  more?: unknown;
  tip: string;
  onClick?: () => void;
}

describe('плашка памяти демона', () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(DaemonPlugin, NAME);
    await host.start();
  });

  function widget(): { id: string; side: string; chip: () => Chip | null } | undefined {
    return host.registry
      .all<{ id: string; side: string; chip: () => Chip | null }>('toolbar.widget')
      .find((one) => one.id === 'daemon');
  }

  it('просит место в тулбаре справа', () => {
    expect(widget()?.side).toBe('right');
  });

  it('пульса ещё не было — молчит', () => {
    expect(widget()!.chip()).toBeNull();
  });

  it('показывает два числа: себя и своих потомков', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };
    const chip = widget()!.chip()!;
    expect(chip.text).toBe('412');
    expect(chip.more).toBe('daemon.size(rss=2048)');
  });

  it('система не мерится — одно число и единица при нём', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: null };
    const chip = widget()!.chip()!;
    expect(chip.text).toBe('daemon.size(rss=412)');
    expect(chip.more).toBeUndefined();
  });

  it('у плашки есть подсказка: числа сами по себе ничего не значат', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };
    expect(widget()!.chip()!.tip).toContain('daemon.aboutKids');
  });

  it('настройка выключает плашку целиком', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };
    expect(widget()!.chip()).not.toBeNull();
    host.ide(NAME).settings.value = { daemon: { memory: false } } as never;
    expect(widget()!.chip()).toBeNull();
  });

  it('щелчок ведёт к своему выключателю', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };

    widget()!.chip()!.onClick!();
    expect(asked).toEqual(['memory']);
  });
});
