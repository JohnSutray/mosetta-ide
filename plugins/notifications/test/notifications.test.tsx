import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import NotificationsPlugin from '../src/client.js';

/**
 * Notifications as a plugin: the core holds the notes, the plugin shows them and
 * decides how long they live.
 */
const NAME = '@mosetta/ide-plugin-notifications';

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

describe('notifications', () => {
  it('no notes — no stack', () => {
    expect(view()).toBeNull();
  });

  it('draws the core\'s notes and closes them with the cross', () => {
    host.surface.notes.notify('one', 'info');
    const id = host.surface.notes.notify('two', 'error');
    const texts = of(view(), 'span').filter((n) => n.props['class'] === 'note-text').map((n) => n.props['children']);
    expect(texts).toEqual(['one', 'two']);
    expect(nodes(view()).some((n) => n.props['class'] === 'notes-all')).toBe(true);
    host.surface.notes.dismiss(id);
    expect(of(view(), 'span').filter((n) => n.props['class'] === 'note-text')).toHaveLength(1);
  });

  it('an ordinary note leaves after a minute, work stays up until it ends', () => {
    host.surface.notes.notify('passing by', 'info');
    const work = host.surface.notes.notify('in progress', 'work');
    vi.advanceTimersByTime(plugin.lifetimeMs + 1);
    expect(host.surface.notes.all.value.map((n) => n.id)).toEqual([work]);
    host.surface.notes.settle(work, 'done', 'info');
    vi.advanceTimersByTime(plugin.lifetimeMs + 1);
    expect(host.surface.notes.all.value).toEqual([]);
  });
});
