import { describe, expect, it } from 'vitest';
import { patchSetting } from '../src/config/patch.js';
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
    const { text, rewritten } = patchSetting(before, 'terminal', 'shell', '/bin/zsh');
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
    const { text, rewritten } = patchSetting(before, 'terminal', 'shell', 'C:\\Program Files\\Git\\bin\\bash.exe');
    expect(rewritten).toBe(false);
    expect(text).toContain('// всё остальное — дефолты');
    expect(read(text).terminal!.shell).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(read(text).editor!.fontSize).toBe(13);
  });

  it('заводит ключ в существующей секции', () => {
    const before = '{\n  "terminal": { "args": ["-l"] }\n}\n';
    const { text } = patchSetting(before, 'terminal', 'shell', '/bin/fish');
    expect(read(text).terminal!.shell).toBe('/bin/fish');
    expect(read(text).terminal!.args).toEqual(['-l']);
  });

  it('пустой файл — законный вход', () => {
    const { text } = patchSetting('', 'terminal', 'shell', '/bin/sh');
    expect(read(text).terminal!.shell).toBe('/bin/sh');
  });

  it('пустая строка стирает выбор', () => {
    const before = '{\n  "terminal": { "shell": "/bin/fish" }\n}\n';
    const { text } = patchSetting(before, 'terminal', 'shell', '');
    expect(read(text).terminal!.shell).toBe('');
  });

  it('кавычки и слэши в пути не ломают файл', () => {
    const before = '{\n  "terminal": { "shell": "" }\n}\n';
    const weird = 'C:\\Program Files\\"odd"\\sh.exe';
    const { text } = patchSetting(before, 'terminal', 'shell', weird);
    expect(read(text).terminal!.shell).toBe(weird);
  });

  it('сломанный файл пересобирается — и об этом говорится вслух', () => {
    const { text, rewritten } = patchSetting('{ это не json', 'terminal', 'shell', '/bin/sh');
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
    const { text, rewritten } = patchSetting(before, 'tree', 'followEditor', false);
    expect(rewritten, 'файл пересобрали, комментарии потеряны').toBe(false);
    expect(text).toContain('"followEditor": false');
    expect(text).toContain('// дерево следует за кареткой');
  });

  it('булева настройка заводится с нуля', () => {
    const { text, rewritten } = patchSetting('{\n}\n', 'tree', 'followEditor', false);
    expect(rewritten).toBe(false);
    expect(JSON.parse(text)).toEqual({ tree: { followEditor: false } });
  });
});
