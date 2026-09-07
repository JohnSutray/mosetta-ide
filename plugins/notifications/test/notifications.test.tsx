import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeHost, nodes, of } from '@ide/api/testing';
import NotificationsPlugin from '../src/client.js';

const NAME = '@ide/plugin-notifications';

let host: FakeHost;
let plugin: NotificationsPlugin;

beforeEach(async () => {
  vi.useFakeTimers();
  host = new FakeHost();
  plugin = host.add(NotificationsPlugin, NAME);
  await host.start();
});

afterEach(() => {
  vi.useRealTimers();
});

function view(): unknown {
  const views = host.registry.all<() => unknown>('chrome.top');
  return views[0]!();
}

describe('уведомления', () => {
  it('нет заметок — нет стопки', () => {
    expect(view()).toBeNull();
  });

  it('рисует заметки ядра и закрывает крестиком', () => {
    host.surface.notes.notify('раз', 'info');
    const id = host.surface.notes.notify('два', 'error');
    const texts = of(view(), 'span').filter((n) => n.props['class'] === 'note-text').map((n) => n.props['children']);
    expect(texts).toEqual(['раз', 'два']);
    expect(nodes(view()).some((n) => n.props['class'] === 'notes-all')).toBe(true);
    host.surface.notes.dismiss(id);
    expect(of(view(), 'span').filter((n) => n.props['class'] === 'note-text')).toHaveLength(1);
  });

  it('обычная заметка уходит через минуту, работа висит до конца', () => {
    host.surface.notes.notify('мимо', 'info');
    const work = host.surface.notes.notify('идёт', 'work');
    vi.advanceTimersByTime(plugin.lifetimeMs + 1);
    expect(host.surface.notes.all.value.map((n) => n.id)).toEqual([work]);
    host.surface.notes.settle(work, 'готово', 'info');
    vi.advanceTimersByTime(plugin.lifetimeMs + 1);
    expect(host.surface.notes.all.value).toEqual([]);
  });
});
