import { describe, expect, it } from 'vitest';
import { patch } from '../src/config/patch.js';
import { jsonc } from '../src/config/jsonc.js';

function read(text: string): Record<string, Record<string, unknown>> {
  return jsonc.parse<Record<string, Record<string, unknown>>>(text, 'settings.json')!;
}

describe('точечная правка настроек', () => {
  it('меняет значение и не трогает комментарии', () => {
    const before = `{
  // Шрифт подобран руками, не менять
  "editor": { "fontSize": 15 },
  "terminal": {
    // Оболочка: своя, а не системная
    "shell": "/bin/bash"
  }
}
`;
    const { text, rewritten } = patch.setting(before, 'terminal', 'shell', '/bin/zsh');
    expect(rewritten, 'пересборка не понадобилась').toBe(false);
    expect(text).toContain('// Шрифт подобран руками, не менять');
    expect(text).toContain('// Оболочка: своя, а не системная');
    expect(read(text).terminal!.shell).toBe('/bin/zsh');
    expect(read(text).editor!.fontSize).toBe(15);
  });

  it('заводит секцию, если её ещё нет', () => {
    const before = `{
  // всё остальное — дефолты
  "editor": { "fontSize": 13 }
}
`;
    const { text, rewritten } = patch.setting(before, 'terminal', 'shell', 'C:\\Program Files\\Git\\bin\\bash.exe');
    expect(rewritten).toBe(false);
    expect(text).toContain('// всё остальное — дефолты');
    expect(read(text).terminal!.shell).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(read(text).editor!.fontSize).toBe(13);
  });

  it('заводит ключ в существующей секции', () => {
    const before = '{\n  "terminal": { "args": ["-l"] }\n}\n';
    const { text } = patch.setting(before, 'terminal', 'shell', '/bin/fish');
    expect(read(text).terminal!.shell).toBe('/bin/fish');
    expect(read(text).terminal!.args).toEqual(['-l']);
  });

  it('список строк правится на месте и не заводит второй ключ (ADR-0192)', () => {
    const raw = '{\n  // маски\n  "find": { "masks": ["*.ts"] }\n}\n';
    const once = patch.setting(raw, 'find', 'masks', ['*.ts', '*.tsx']);
    expect(once.rewritten).toBe(false);
    expect(once.text).toContain('// маски');
    expect(jsonc.parse<{ find: { masks: string[] } }>(once.text, 'x')?.find.masks).toEqual(['*.ts', '*.tsx']);
    const twice = patch.setting(once.text, 'find', 'masks', []);
    expect(twice.rewritten).toBe(false);
    expect(twice.text.split('"masks"').length).toBe(2);
    expect(jsonc.parse<{ find: { masks: string[] } }>(twice.text, 'x')?.find.masks).toEqual([]);
  });

  it('пустой файл — законный вход', () => {
    const { text } = patch.setting('', 'terminal', 'shell', '/bin/sh');
    expect(read(text).terminal!.shell).toBe('/bin/sh');
  });

  it('пустая строка стирает выбор', () => {
    const before = '{\n  "terminal": { "shell": "/bin/fish" }\n}\n';
    const { text } = patch.setting(before, 'terminal', 'shell', '');
    expect(read(text).terminal!.shell).toBe('');
  });

  it('кавычки и слэши в пути не ломают файл', () => {
    const before = '{\n  "terminal": { "shell": "" }\n}\n';
    const weird = 'C:\\Program Files\\"odd"\\sh.exe';
    const { text } = patch.setting(before, 'terminal', 'shell', weird);
    expect(read(text).terminal!.shell).toBe(weird);
  });

  it('сломанный файл пересобирается — и об этом говорится вслух', () => {
    const { text, rewritten } = patch.setting('{ это не json', 'terminal', 'shell', '/bin/sh');
    expect(rewritten, 'звавший обязан узнать, что комментарии потеряны').toBe(true);
    expect(read(text).terminal!.shell).toBe('/bin/sh');
  });

  it('булев тумблер правится на месте, комментарии целы (ADR-0130)', () => {
    const before = [
      '// Настройки. Комментарии тут половина ценности.',
      '{',
      '  // дерево следует за кареткой',
      '  "tree": { "followEditor": true },',
      '  "terminal": { "shell": "" }',
      '}',
      '',
    ].join('\n');
    const { text, rewritten } = patch.setting(before, 'tree', 'followEditor', false);
    expect(rewritten, 'файл пересобрали, комментарии потеряны').toBe(false);
    expect(text).toContain('"followEditor": false');
    expect(text).toContain('// дерево следует за кареткой');
  });

  it('булева настройка заводится с нуля', () => {
    const { text, rewritten } = patch.setting('{\n}\n', 'tree', 'followEditor', false);
    expect(rewritten).toBe(false);
    expect(JSON.parse(text)).toEqual({ tree: { followEditor: false } });
  });
});

describe('сброс настройки к заводской (ADR-0213)', () => {
  const before = `{
  // Шрифт подобран руками
  "editor": { "fontSize": 15, "tabSize": 4 },
  "terminal": {
    // Оболочка своя
    "shell": "/bin/bash"
  }
}
`;

  it('убирает ключ и не трогает комментарии и соседей', () => {
    const { text, rewritten } = patch.unset(before, 'editor', 'fontSize');
    expect(rewritten, 'пересборка не понадобилась').toBe(false);
    expect(text).toContain('// Шрифт подобран руками');
    expect(text).toContain('// Оболочка своя');
    expect(read(text).editor).toEqual({ tabSize: 4 });
    expect(read(text).terminal!.shell).toBe('/bin/bash');
  });

  it('последний ключ раздела — раздел остаётся пустым, файл цел', () => {
    const { text, rewritten } = patch.unset(before, 'terminal', 'shell');
    expect(rewritten).toBe(false);
    expect(read(text).terminal).toEqual({});
    expect(read(text).editor).toEqual({ fontSize: 15, tabSize: 4 });
  });

  it('ключа нет — файл не меняется ни на символ', () => {
    expect(patch.unset(before, 'git', 'autoFetchMinutes').text).toBe(before);
  });

  it('ключ на своей строке уходит вместе со строкой — файл ровный', () => {
    const tidy = `{\n  "editor": {\n    "fontSize": 15,\n    "tabSize": 4\n  }\n}\n`;
    expect(patch.unset(tidy, 'editor', 'fontSize').text).toBe(`{\n  "editor": {\n    "tabSize": 4\n  }\n}\n`);
    expect(patch.unset(tidy, 'editor', 'tabSize').text).toBe(`{\n  "editor": {\n    "fontSize": 15\n  }\n}\n`);
  });

  it('вписать и сбросить — файл тот же байт в байт', () => {
    const tidy = `{\n  // своё\n  "editor": {\n    "fontSize": 15\n  }\n}\n`;
    const written = patch.setting(tidy, 'editor', 'lineNumbers', false).text;
    expect(written).not.toBe(tidy);
    expect(patch.unset(written, 'editor', 'lineNumbers').text).toBe(tidy);
  });
});
