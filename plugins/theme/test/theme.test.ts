import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import ThemePlugin from '../src/client.js';

describe('тема', () => {
  it('кладёт палитру и общие элементы одним стилем', async () => {
    const host = new FakeHost();
    host.add(ThemePlugin, '@mosetta/ide-plugin-theme');
    await host.start();
    const css = host.ide('@mosetta/ide-plugin-theme').styles.join('');
    for (const token of ['--bg', '--fg', '--panel-bg', '--control-bg', '--git-modified', '--ui-font']) {
      expect(css, token).toContain(`${token}:`);
    }
    expect(css).toContain('.field');
    expect(css).toContain('.button');
  });
});
