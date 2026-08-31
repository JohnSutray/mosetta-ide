import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shells } from '../src/env/shell.js';

const WIN = process.platform === 'win32';
const EXT = WIN ? '.cmd' : '';

let dir: string;
let shell: string;
let hidden: string;
let savedPath: string | undefined;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-shell-'));
  shell = path.join(dir, `ide-fake-shell${EXT}`);
  await fs.writeFile(shell, '', 'utf8');

  const away = path.join(dir, 'away');
  await fs.mkdir(away, { recursive: true });
  hidden = path.join(away, `ide-fake-shell${EXT}`);
  await fs.writeFile(hidden, '', 'utf8');

  savedPath = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${savedPath ?? ''}`;
});

afterAll(async () => {
  process.env.PATH = savedPath;
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('чем запускать терминалы', () => {
  it('имя ищется по PATH, а путь берётся как есть', () => {
    expect(shells.resolveShell(`ide-fake-shell${EXT}`)).toBe(shell);
    expect(shells.resolveShell(shell)).toBe(shell);
    expect(shells.resolveShell(path.join(dir, 'нет-такой'))).toBeNull();
    expect(shells.resolveShell('ide-нет-такой-оболочки')).toBeNull();
    expect(shells.resolveShell('   ')).toBeNull();
  });

  it('в конфиг уезжает имя, когда это без потерь', () => {
    expect(shells.ref(shell)).toBe(`ide-fake-shell${EXT}`);
    expect(path.isAbsolute(shells.ref(shell))).toBe(false);
  });

  it('одноимённая чужая оболочка сокращаться не должна', () => {
    expect(shells.ref(hidden)).toBe(hidden);
  });

  it('записанное читается обратно в тот же файл', () => {
    for (const original of [shell, hidden]) {
      const stored = shells.ref(original);
      expect(shells.loginShell({ shell: stored }).file, stored).toBe(original);
    }
  });

  it('оболочка с чужой машины не ломает эту, но и не молчит', () => {
    const alien = WIN ? '/bin/zsh' : 'C:\\WINDOWS\\system32\\cmd.exe';
    const choice = shells.loginShell({ shell: alien });

    expect(choice.problem, 'подмена обязана быть названа').toBe(alien);
    expect(choice.file).not.toBe(alien);
    expect(choice.file).toBe(shells.loginShell().file);
  });

  it('пустая строка — это «как решит система», а не поломка', () => {
    expect(shells.loginShell({ shell: '' }).problem).toBeUndefined();
    expect(shells.loginShell({ shell: '' }).file).toBe(shells.loginShell().file);
  });

  it('аргументы подбираются по НАЙДЕННОЙ оболочке, а не по записи', () => {
    const choice = shells.loginShell({ shell: `ide-fake-shell${EXT}` });
    expect(choice.file).toBe(shell);
    expect(shells.loginShell({ shell: shell, args: ['--мои'] }).args).toEqual(['--мои']);
  });
});
