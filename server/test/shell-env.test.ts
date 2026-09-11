import { describe, expect, it } from 'vitest';
import { ShellEnv, type Harvester } from '../src/env/shell-env.js';
import { Processes } from '../src/env/processes.js';
import { Exec } from '../src/env/exec.js';
import { Which } from '../src/env/which.js';

const plan = () => new Exec(new Which({ path: null }));

function fakeShell(stdout: string, ok = true): Harvester {
  return async () => ({ ok, stdout, stderr: ok ? '' : 'оболочка отказалась', timedOut: false });
}

const MARK = '__IDE_ENV_9f3a__';

describe('окружение человека', () => {
  it('разбирает ответ настоящей оболочки', async () => {
    if (process.platform === 'win32') return;
    const env = new ShellEnv();
    const processes = new Processes({ current: null }, plan());
    await env.prime((spec) => processes.run(spec), { file: '/bin/sh', args: [] }, process.cwd());

    expect(env.current).not.toBe(null);
    expect(env.path).toContain('/');
    expect(Object.keys(env.current ?? {}).length).toBeGreaterThan(3);
  });

  it('отрезает баннер интерактивного rc по метке', async () => {
    const env = new ShellEnv();
    await env.prime(
      fakeShell(`Добро пожаловать!\nfortune: съешь ещё этих булок\n${MARK}PATH=/своё/bin\0HOME=/дом\0`),
      { file: '/bin/zsh', args: ['-l', '-i'] },
      '/дом',
    );
    expect(env.current).toEqual({ PATH: '/своё/bin', HOME: '/дом' });
    expect(env.path).toBe('/своё/bin');
  });

  it('значение с переводом строки доезжает целиком', async () => {
    const env = new ShellEnv();
    await env.prime(
      fakeShell(`${MARK}PATH=/bin\0GREETING=раз\nдва\0`),
      { file: '/bin/zsh', args: [] },
      '/дом',
    );
    expect(env.current?.GREETING).toBe('раз\nдва');
  });

  it('переменные самой пробы выбрасываются', async () => {
    const env = new ShellEnv();
    await env.prime(
      fakeShell(`${MARK}PATH=/bin\0PWD=/дом\0OLDPWD=/\0SHLVL=1\0_=/usr/bin/env\0`),
      { file: '/bin/zsh', args: [] },
      '/дом',
    );
    expect(env.current).toEqual({ PATH: '/bin' });
  });

  it('оболочка без метки не считается ответившей', async () => {
    const env = new ShellEnv();
    await env.prime(fakeShell('я не понял вашу команду'), { file: '/bin/nu', args: [] }, '/дом');
    expect(env.current).toBe(null);
    expect(env.path).toBe(null);
  });

  it('отказ оболочки не собирает пустое окружение', async () => {
    const env = new ShellEnv();
    await env.prime(fakeShell('', false), { file: '/bin/zsh', args: [] }, '/дом');
    expect(env.current).toBe(null);
  });

  it('зависшая оболочка не держит и не собирает', async () => {
    const env = new ShellEnv();
    const hung: Harvester = async () => ({ ok: false, stdout: '', stderr: '', timedOut: true });
    await env.prime(hung, { file: '/bin/zsh', args: [] }, '/дом');
    expect(env.current).toBe(null);
  });

  it('два запроса подряд собирают один раз', async () => {
    let asked = 0;
    const counting: Harvester = async (spec) => {
      asked += 1;
      return fakeShell(`${MARK}PATH=/bin\0`)(spec);
    };
    const env = new ShellEnv();
    await Promise.all([
      env.prime(counting, { file: '/bin/zsh', args: [] }, '/дом'),
      env.prime(counting, { file: '/bin/zsh', args: [] }, '/дом'),
    ]);
    expect(asked).toBe(1);
  });

  it('смена оболочки в настройках забывает собранное', async () => {
    const env = new ShellEnv();
    await env.prime(fakeShell(`${MARK}PATH=/старое\0`), { file: '/bin/zsh', args: [] }, '/дом');
    expect(env.path).toBe('/старое');

    env.forget();
    expect(env.current).toBe(null);

    await env.prime(fakeShell(`${MARK}PATH=/новое\0`), { file: '/bin/fish', args: [] }, '/дом');
    expect(env.path).toBe('/новое');
  });

  it('проба идёт в ДОМ, а не там, где подняли сервер', async () => {
    let seen = '';
    const spy: Harvester = async (spec) => {
      seen = spec.cwd ?? '';
      return { ok: true, stdout: `${MARK}PATH=/bin\0`, stderr: '', timedOut: false };
    };
    const env = new ShellEnv();
    await env.prime(spy, { file: '/bin/zsh', args: ['-l', '-i'] }, '/дом/человека');
    expect(seen).toBe('/дом/человека');
  });

  it('спрашиваем ВЫБРАННУЮ оболочку её же аргументами', async () => {
    let asked: { file: string; args: string[] } = { file: '', args: [] };
    const spy: Harvester = async (spec) => {
      asked = { file: spec.command, args: spec.args };
      return { ok: true, stdout: `${MARK}PATH=/bin\0`, stderr: '', timedOut: false };
    };
    const env = new ShellEnv();
    await env.prime(spy, { file: '/opt/homebrew/bin/fish', args: ['-l', '-i'] }, '/дом');

    expect(asked.file).toBe('/opt/homebrew/bin/fish');
    expect(asked.args.slice(0, 2)).toEqual(['-l', '-i']);
    expect(asked.args[2]).toBe('-c');
    expect(asked.args[3]).toContain('env -0');
  });
});

describe('окружение человека доезжает до запуска', () => {
  const node = process.execPath;
  const read = (name: string) => ['-e', `process.stdout.write(String(process.env.${name}))`];

  it('намерение «user-shell» подмешивает собранное', async () => {
    const processes = new Processes({ current: { НАШЕЛ: 'из оболочки' } }, plan());
    const ran = await processes.run({
      command: node,
      args: read('НАШЕЛ'),
      reason: 'тест',
      wants: ['user-shell'],
    });
    expect(ran.stdout).toBe('из оболочки');
  });

  it('без намерения окружение сервера остаётся нетронутым', async () => {
    const processes = new Processes({ current: { НАШЕЛ: 'из оболочки' } }, plan());
    const ran = await processes.run({ command: node, args: read('НАШЕЛ'), reason: 'тест' });
    expect(ran.stdout).toBe('undefined');
  });

  it('пока оболочка не ответила, работаем на окружении сервера', async () => {
    const processes = new Processes({ current: null }, plan());
    const ran = await processes.run({
      command: node,
      args: read('PATH'),
      reason: 'тест',
      wants: ['user-shell'],
    });
    expect(ran.stdout).toBe(process.env.PATH);
  });

  it('своё у инструмента сильнее окружения человека', async () => {
    const processes = new Processes({ current: { НАШЕЛ: 'из оболочки' } }, plan());
    const ran = await processes.run({
      command: node,
      args: read('НАШЕЛ'),
      reason: 'тест',
      wants: ['user-shell'],
      env: { НАШЕЛ: 'своё' },
    });
    expect(ran.stdout).toBe('своё');
  });
});
