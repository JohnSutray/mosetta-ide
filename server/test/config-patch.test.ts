import { describe, expect, it } from 'vitest';
import { patch } from '../src/config/patch.js';
import { jsonc } from '../src/config/jsonc.js';

/**
 * Editing `settings.json`. The file belongs to the human: their comments and their key
 * order live there, and one setting has no right to sweep them away. What is checked is
 * not "did we get valid JSON" but precisely that — that what stood next to it stayed
 * where it was.
 */
function read(text: string): Record<string, Record<string, unknown>> {
  return jsonc.parse<Record<string, Record<string, unknown>>>(text, 'settings.json')!;
}

describe('a surgical settings edit', () => {
  it('changes the value and leaves the comments alone', () => {
    const before = `{
  // The font was picked by hand, do not change it
  "editor": { "fontSize": 15 },
  "terminal": {
    // The shell: mine, not the system's
    "shell": "/bin/bash"
  }
}
`;
    const { text, rewritten } = patch.setting(before, 'terminal', 'shell', '/bin/zsh');
    expect(rewritten, 'no rebuild was needed').toBe(false);
    expect(text).toContain('// The font was picked by hand, do not change it');
    expect(text).toContain('// The shell: mine, not the system\'s');
    expect(read(text).terminal!.shell).toBe('/bin/zsh');
    expect(read(text).editor!.fontSize).toBe(15);
  });

  it('creates the section if it is not there yet', () => {
    const before = `{
  // everything else is the defaults
  "editor": { "fontSize": 13 }
}
`;
    const { text, rewritten } = patch.setting(before, 'terminal', 'shell', 'C:\\Program Files\\Git\\bin\\bash.exe');
    expect(rewritten).toBe(false);
    expect(text).toContain('// everything else is the defaults');
    expect(read(text).terminal!.shell).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(read(text).editor!.fontSize).toBe(13);
  });

  it('creates a key in an existing section', () => {
    const before = '{\n  "terminal": { "args": ["-l"] }\n}\n';
    const { text } = patch.setting(before, 'terminal', 'shell', '/bin/fish');
    expect(read(text).terminal!.shell).toBe('/bin/fish');
    expect(read(text).terminal!.args).toEqual(['-l']);
  });

  it('a list of strings is edited in place and does not create a second key', () => {
    const raw = '{\n  // the masks\n  "find": { "masks": ["*.ts"] }\n}\n';
    const once = patch.setting(raw, 'find', 'masks', ['*.ts', '*.tsx']);
    expect(once.rewritten).toBe(false);
    expect(once.text).toContain('// the masks');
    expect(jsonc.parse<{ find: { masks: string[] } }>(once.text, 'x')?.find.masks).toEqual(['*.ts', '*.tsx']);
    const twice = patch.setting(once.text, 'find', 'masks', []);
    expect(twice.rewritten).toBe(false);
    expect(twice.text.split('"masks"').length).toBe(2);
    expect(jsonc.parse<{ find: { masks: string[] } }>(twice.text, 'x')?.find.masks).toEqual([]);
  });

  it('an empty file is a legitimate input', () => {
    const { text } = patch.setting('', 'terminal', 'shell', '/bin/sh');
    expect(read(text).terminal!.shell).toBe('/bin/sh');
  });

  it('an empty string erases the choice', () => {
    const before = '{\n  "terminal": { "shell": "/bin/fish" }\n}\n';
    const { text } = patch.setting(before, 'terminal', 'shell', '');
    expect(read(text).terminal!.shell).toBe('');
  });

  it('quotes and slashes in a path do not break the file', () => {
    const before = '{\n  "terminal": { "shell": "" }\n}\n';
    const weird = 'C:\\Program Files\\"odd"\\sh.exe';
    const { text } = patch.setting(before, 'terminal', 'shell', weird);
    expect(read(text).terminal!.shell).toBe(weird);
  });

  it('a broken file is rebuilt — and that is said out loud', () => {
    const { text, rewritten } = patch.setting('{ not json', 'terminal', 'shell', '/bin/sh');
    expect(rewritten, 'the caller has to learn that the comments were lost').toBe(true);
    expect(read(text).terminal!.shell).toBe('/bin/sh');
  });

  it('a boolean toggle is edited in place, the comments survive', () => {
    const before = [
      '// Settings. The comments here are half the value.',
      '{',
      '  // the tree follows the caret',
      '  "tree": { "followEditor": true },',
      '  "terminal": { "shell": "" }',
      '}',
      '',
    ].join('\n');
    const { text, rewritten } = patch.setting(before, 'tree', 'followEditor', false);
    expect(rewritten, 'the file was rebuilt, the comments are lost').toBe(false);
    expect(text).toContain('"followEditor": false');
    expect(text).toContain('// the tree follows the caret');
  });

  it('a boolean setting is created from nothing', () => {
    const { text, rewritten } = patch.setting('{\n}\n', 'tree', 'followEditor', false);
    expect(rewritten).toBe(false);
    expect(JSON.parse(text)).toEqual({ tree: { followEditor: false } });
  });
});

describe('resetting a setting to factory', () => {
  const before = `{
  // The font was picked by hand
  "editor": { "fontSize": 15, "tabSize": 4 },
  "terminal": {
    // The shell is mine
    "shell": "/bin/bash"
  }
}
`;

  it('removes the key and leaves the comments and the neighbours alone', () => {
    const { text, rewritten } = patch.unset(before, 'editor', 'fontSize');
    expect(rewritten, 'no rebuild was needed').toBe(false);
    expect(text).toContain('// The font was picked by hand');
    expect(text).toContain('// The shell is mine');
    expect(read(text).editor).toEqual({ tabSize: 4 });
    expect(read(text).terminal!.shell).toBe('/bin/bash');
  });

  it('the section\'s last key — the section stays empty, the file is whole', () => {
    const { text, rewritten } = patch.unset(before, 'terminal', 'shell');
    expect(rewritten).toBe(false);
    expect(read(text).terminal).toEqual({});
    expect(read(text).editor).toEqual({ fontSize: 15, tabSize: 4 });
  });

  it('no such key — the file does not change by a single character', () => {
    expect(patch.unset(before, 'git', 'autoFetchMinutes').text).toBe(before);
  });

  it('a key alone on its line leaves with the line — the file stays even', () => {
    const tidy = `{\n  "editor": {\n    "fontSize": 15,\n    "tabSize": 4\n  }\n}\n`;
    expect(patch.unset(tidy, 'editor', 'fontSize').text).toBe(`{\n  "editor": {\n    "tabSize": 4\n  }\n}\n`);
    expect(patch.unset(tidy, 'editor', 'tabSize').text).toBe(`{\n  "editor": {\n    "fontSize": 15\n  }\n}\n`);
  });

  it('write it in and reset it — the file is the same byte for byte', () => {
    const tidy = `{\n  // mine\n  "editor": {\n    "fontSize": 15\n  }\n}\n`;
    const written = patch.setting(tidy, 'editor', 'lineNumbers', false).text;
    expect(written).not.toBe(tidy);
    expect(patch.unset(written, 'editor', 'lineNumbers').text).toBe(tidy);
  });

  it('a one-line section: write in, change and reset — byte for byte', () => {
    const inline = `{\n  "find": { "masks": ["*.ts"] },\n  "git": {}\n}\n`;
    const written = patch.setting(inline, 'find', 'masksOff', ['*.min.js']).text;
    const emptied = patch.setting(written, 'find', 'masksOff', []).text;
    expect(patch.unset(emptied, 'find', 'masksOff').text).toBe(inline);
    expect(patch.unset(inline, 'find', 'masks').text).toBe(`{\n  "git": {}\n}\n`);
  });

  it('a section whose last key was removed leaves whole', () => {
    const one = `{\n  "find": {\n    "maxHits": 500\n  }\n}\n`;
    expect(patch.unset(one, 'find', 'maxHits').text).toBe(`{\n}\n`);

    const first = `{\n  "find": { "maxHits": 500 },\n  "tree": { "followEditor": true }\n}\n`;
    expect(patch.unset(first, 'find', 'maxHits').text).toBe(`{\n  "tree": { "followEditor": true }\n}\n`);
  });

  it('move a setting and bring it back — the file is byte for byte', () => {
    const before = `// the project's\n{\n  "lsp": {\n    "servers": {}\n  }\n}\n`;
    const with_ = patch.setting(before, 'find', 'maxHits', 500).text;
    expect(with_).toContain('"maxHits": 500');
    expect(patch.unset(with_, 'find', 'maxHits').text).toBe(before);
  });

  it('an object and an array of objects are written surgically, the neighbours\' comments survive', () => {
    const before = [
      '// my config',
      '{',
      '  // what to run with',
      '  "terminal": { "shell": "zsh" },',
      '  "keymap": {',
      '    "version": 1,',
      '    // my key',
      '    "bindings": [{ "command": "file.save", "key": "meta+s" }]',
      '  }',
      '}',
      '',
    ].join('\n');

    const written = patch.setting(before, 'keymap', 'bindings', [
      { command: 'file.save', key: 'meta+s' },
      { command: 'keys.show', key: 'meta+9', when: 'global' },
    ]);
    expect(written.rewritten, 'surgically rather than by a rebuild').toBe(false);
    expect(written.text).toContain('// my config');
    expect(written.text).toContain('// what to run with');
    expect(written.text).toContain('"shell": "zsh"');
    expect(written.text).toContain('"keys.show"');
    expect(written.text).toContain('"version": 1');

    expect(written.text).toContain('      { "command": "file.save", "key": "meta+s" },');
    expect(written.text.split('\n').filter((line) => line.includes('"command"'))).toHaveLength(2);
  });

  it('an object value is written and removed whole', () => {
    const before = `{\n  "lsp": {\n    "servers": { "typescript": { "enabled": true } }\n  }\n}\n`;
    const written = patch.setting(before, 'lsp', 'servers', {
      typescript: { enabled: false, args: ['--stdio'] },
    });
    expect(written.rewritten).toBe(false);
    expect(written.text).toContain('"--stdio"');
    expect(patch.unset(written.text, 'lsp', 'servers').text).toBe(`{\n}\n`);
  });

  it('a section with a comment inside it does not count as empty', () => {
    const noisy = `{\n  "find": {\n    // the masks will go here\n    "maxHits": 500\n  }\n}\n`;
    expect(patch.unset(noisy, 'find', 'maxHits').text).toBe(`{\n  "find": {\n    // the masks will go here\n  }\n}\n`);
  });
});
