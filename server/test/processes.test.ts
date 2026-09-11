import { describe, expect, it } from 'vitest';
import { Env } from '../src/env/env.js';

const node = process.execPath;

function script(body: string): string[] {
  return ['-e', body];
}

describe('запуск подпроцессов', () => {
  it('вывод доезжает целиком, код возврата виден', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write("привет"); process.exit(0)'),
      reason: 'тест',
    });
    expect(ran.ok).toBe(true);
    expect(ran.stdout).toBe('привет');
    expect(ran.code).toBe(0);
    expect(ran.timedOut).toBe(false);
  });

  it('чужой отказ — это ответ, а не исключение', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stderr.write("так нельзя"); process.exit(3)'),
      reason: 'тест',
    });
    expect(ran.ok).toBe(false);
    expect(ran.code).toBe(3);
    expect(ran.stderr).toBe('так нельзя');
  });

  it('несуществующая команда не роняет запрос', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: 'этого-точно-нет-на-машине',
      args: [],
      reason: 'тест',
    });
    expect(ran.ok).toBe(false);
    expect(ran.code).toBe(null);
    expect(ran.stderr).not.toBe('');
  });

  it('зависший убивается и говорит, что убит по таймауту', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'тест',
      timeoutMs: 150,
    });
    expect(ran.timedOut).toBe(true);
    expect(ran.ok).toBe(false);
  });

  it('переполнение вывода СКАЗАНО вслух, а не проглочено', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write("x".repeat(200000))'),
      reason: 'тест',
      maxBuffer: 1024,
    });
    expect(ran.truncated).toBe(true);
    expect(ran.ok).toBe(false);
    expect(ran.stderr).toContain('1024');
  });

  it('поток отдаёт вывод по мере появления, а не в конце', async () => {
    const processes = new Env().processes;
    const seen: string[] = [];
    const ran = await processes.stream(
      {
        command: node,
        args: script(
          'process.stdout.write("раз\\n"); setTimeout(() => process.stdout.write("два\\n"), 60)',
        ),
        reason: 'тест',
      },
      (chunk) => seen.push(chunk),
    );
    expect(ran.ok).toBe(true);
    expect(seen.join('')).toContain('раз');
    expect(seen.join('')).toContain('два');
    expect(seen.length).toBeGreaterThan(1);
  });

  it('оба потока текут в один: прогресс печатается в stderr', async () => {
    const processes = new Env().processes;
    const seen: string[] = [];
    await processes.stream(
      {
        command: node,
        args: script('process.stderr.write("это прогресс")'),
        reason: 'тест',
      },
      (chunk) => seen.push(chunk),
    );
    expect(seen.join('')).toContain('это прогресс');
  });

  it('учёт показывает живых и забывает мёртвых', async () => {
    const processes = new Env().processes;
    const handle = processes.start({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'долгожитель',
      owner: '/проект',
    });

    const alive = processes.alive();
    expect(alive).toHaveLength(1);
    expect(alive[0]!.reason).toBe('долгожитель');
    expect(alive[0]!.owner).toBe('/проект');
    expect(alive[0]!.adopted).toBe(false);

    const dead = new Promise<void>((resolve) => handle.child.once('exit', () => resolve()));
    handle.kill();
    await dead;
    expect(processes.alive()).toEqual([]);
  });

  it('закрытие проекта прибирает осиротевшее', async () => {
    const processes = new Env().processes;
    const orphan = processes.start({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'долгий fetch',
      owner: '/проект',
    });
    const other = processes.start({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'чужой',
      owner: '/другой',
    });

    const dead = new Promise<void>((resolve) => orphan.child.once('exit', () => resolve()));
    expect(processes.killOwned('/проект')).toBe(1);
    await dead;

    expect(processes.alive().map((one) => one.reason)).toEqual(['чужой']);
    other.kill();
  });

  it('приёмыш виден в учёте, но не гасится вместе с чужим', async () => {
    const processes = new Env().processes;
    let killed = false;
    const forget = processes.adopt(
      { pid: 4242, command: 'zsh', reason: 'терминал root::dev', owner: '/проект' },
      () => (killed = true),
    );

    expect(processes.alive()[0]!.adopted).toBe(true);
    expect(processes.killOwned('/проект')).toBe(0);
    expect(killed).toBe(false);

    forget();
    expect(processes.alive()).toEqual([]);
  });

  it('намерение «машинный вывод» доезжает до процесса', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write(String(process.env.LC_ALL))'),
      reason: 'тест',
      wants: ['machine-readable'],
    });
    expect(ran.stdout).toBe('C');
  });

  it('намерение «не спрашивать» гасит запрос пароля', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write(String(process.env.GIT_TERMINAL_PROMPT))'),
      reason: 'тест',
      wants: ['no-prompts'],
    });
    expect(ran.stdout).toBe('0');
  });

  it('свои переменные сильнее намерения: инструмент знает про себя больше', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write(String(process.env.LC_ALL))'),
      reason: 'тест',
      wants: ['machine-readable'],
      env: { LC_ALL: 'ru_RU.UTF-8' },
    });
    expect(ran.stdout).toBe('ru_RU.UTF-8');
  });
});
