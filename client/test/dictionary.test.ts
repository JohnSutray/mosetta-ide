import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';

/**
 * Labels are data. A key without a translation is shown as the key itself — visible,
 * but silly; better a failing test than an interface saying that.
 *
 * The check for "every core command has a name" is no longer here: the core has no
 * commands of its own left, and the labels moved into the dictionaries of the plugins
 * that declare those commands. The same check is now done by a distribution test —
 * against the plugins that came up, rather than against a table in the protocol.
 */
describe('the core dictionary', () => {
  it('holds no command keys: commands belong to plugins', () => {
    const ours = Object.keys(en as Record<string, string>).filter((key) => key.startsWith('command.'));
    expect(ours, `command labels in the core: ${ours.join(', ')}`).toEqual([]);
  });

  it('holds no empty strings', () => {
    const empty = Object.entries(en as Record<string, string>)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty, `empty labels: ${empty.join(', ')}`).toEqual([]);
  });
});
