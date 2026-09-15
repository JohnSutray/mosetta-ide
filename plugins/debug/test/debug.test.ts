import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Logger, ProcessHandle, RunAsk } from '@mosetta/ide-api/server';
import { JsDebugAdapter } from '../src/adapter.js';
import { DebugHost, type DebugProject, type TerminalRunner } from '../src/host.js';
import { ServerReady } from '../src/ready.js';
import { DEBUG_DEFAULTS, type DebugSettings } from '../src/settings.js';
import type { FileBreakpoints, Output, RunInfo, Stop } from '../src/types.js';
import { DapSession, type SessionOwner } from '../src/session.js';
import { DapWire, type Stream } from '../src/wire.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const fixtures = path.join(here, 'fixtures');

const quiet: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

type Emitted = { event: string; payload: unknown };

class Bench {
  readonly emitted: Emitted[] = [];
  readonly children: ChildProcess[] = [];
  readonly held = new Set<string>();
  readonly host: DebugHost;

  constructor(terminal: TerminalRunner = null, root = fixtures, settings: Partial<DebugSettings> = {}) {
    const project: DebugProject = {
      root,
      resolve: (relative) => {
        const absolute = path.resolve(root, relative);
        if (path.relative(root, absolute).startsWith('..')) throw new Error(`escapes root: ${relative}`);
        return absolute;
      },
      emit: (event, payload) => this.emitted.push({ event, payload }),
      hold: (reason) => {
        this.held.add(reason);
        return () => this.held.delete(reason);
      },
      start: (ask) => this.start(ask),
    };
    this.host = new DebugHost(project, new JsDebugAdapter(pkg, os.tmpdir()), quiet, terminal, undefined, () => ({
      ...DEBUG_DEFAULTS,
      ...settings,
    }));
  }

  private start(ask: RunAsk): ProcessHandle {
    const child = spawn(ask.command, ask.args, {
      cwd: ask.cwd,
      env: { ...process.env, ...ask.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.children.push(child);
    return { child, kill: () => child.kill(), memoryMb: async () => null };
  }

  of<T>(event: string): T[] {
    return this.emitted.filter((one) => one.event === event).map((one) => one.payload as T);
  }

  async until<T>(what: string, probe: () => T | undefined | null | false, ms = 15_000): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
      const value = probe();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  stops(): Array<{ run: string; session: string; stop: Stop }> {
    return this.of('stopped');
  }

  output(): string {
    return this.of<Output>('output')
      .map((one) => one.text)
      .join('');
  }

  lastRuns(): RunInfo[] {
    return this.of<RunInfo[]>('runs').at(-1) ?? [];
  }

  ended(run: string): boolean {
    return this.lastRuns().some((one) => one.id === run && one.state === 'ended');
  }

  dispose(): void {
    this.host.dispose();
    for (const child of this.children) if (child.exitCode === null) child.kill('SIGKILL');
  }
}

let bench: Bench;

afterEach(() => bench?.dispose());

function shellRunner(consoles: Array<{ command: string; sameShell: string; env: Record<string, string>; out: string }>): TerminalRunner {
  return (ask) => {
    const entry = { command: ask.command, sameShell: ask.sameShell, env: ask.env, out: '' };
    consoles.push(entry);
    const listeners = new Set<(data: string) => void>();
    const shell = spawn('sh', ['-c', ask.command], { cwd: ask.cwd, env: { ...process.env, ...ask.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const heard = (chunk: Buffer): void => {
      entry.out += String(chunk);
      for (const listener of listeners) listener(String(chunk));
    };
    shell.stdout.on('data', heard);
    shell.stderr.on('data', heard);
    bench.children.push(shell);
    return {
      pid: shell.pid ?? 0,
      watch: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  };
}

function chromeMissing(): string | null {
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.some((one) => existsSync(one)) ? null : 'Chrome is not installed on this machine';
}

const NO_CHROME = chromeMissing();
if (NO_CHROME) console.warn(`[debug] ${NO_CHROME} — the browser test is skipped`);

describe('адаптер привезён', () => {
  it('лежит в пакете той версии, что записана в паспорте', () => {
    const passport = JSON.parse(readFileSync(path.join(pkg, 'vendor', 'js-debug.json'), 'utf8')) as {
      version: string;
      entry: string;
    };
    expect(existsSync(path.join(pkg, 'vendor', passport.entry))).toBe(true);
    expect(new JsDebugAdapter(pkg, os.tmpdir()).script).toBe(path.join(pkg, 'vendor', passport.entry));
    expect(passport.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('отладка против настоящего адаптера', { timeout: 30_000 }, () => {
  it('точка в JS: стек, переменные с раскрытием, вычисление, шаг, текст внутренностей Node', async () => {
    bench = new Bench();
    await bench.host.setBreakpoints('plain.js', [4]);
    const run = await bench.host.launch({ program: 'plain.js' });

    const hit = await bench.until('stop on breakpoint', () => bench.stops()[0]);
    expect(hit.stop.reason).toBe('breakpoint');

    const frames = await bench.host.stack(run.id, hit.session, hit.stop.thread);
    expect(frames[0]).toMatchObject({ name: 'global.add', line: 4, source: { kind: 'project', path: 'plain.js' } });
    const internal = frames.find((frame) => frame.source?.kind === 'adapter');
    expect(internal?.faint).toBe(true);

    const scopes = await bench.host.scopes(run.id, hit.session, frames[0]!.id);
    const locals = await bench.host.variables(run.id, hit.session, scopes[0]!.ref);
    expect(locals.find((one) => one.name === 'sum')?.value).toBe('0');
    const box = locals.find((one) => one.name === 'box');
    expect(box?.ref).toBeGreaterThan(0);
    const inside = await bench.host.variables(run.id, hit.session, box!.ref);
    expect(inside.find((one) => one.name === 'label')?.value).toBe("'нота'");

    const evaluated = await bench.host.evaluate(run.id, hit.session, 'items.length * 2', frames[0]!.id, 'hover');
    expect(evaluated.value).toBe('6');

    if (internal?.source?.kind !== 'adapter') throw new Error('expected an adapter-only frame');
    const text = await bench.host.source(run.id, hit.session, internal.source.reference);
    expect(text.text.length).toBeGreaterThan(1000);

    await bench.host.step(run.id, hit.session, hit.stop.thread, 'next');
    const stepped = await bench.until('stop after step', () => bench.stops()[1]);
    expect(stepped.stop.reason).toBe('step');

    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
    expect(bench.output()).toContain('sum 6 нота');
    expect(bench.held.size).toBe(0);
  });

  it('точка подтверждается позже ответа — и событие это говорит', async () => {
    bench = new Bench();
    const before = await bench.host.setBreakpoints('plain.js', [4]);
    expect(before.breakpoints).toEqual([{ line: 4, verified: false }]);
    const run = await bench.host.launch({ program: 'plain.js' });
    await bench.until('verified', () =>
      bench.of<FileBreakpoints>('breakpoints').some((one) => one.breakpoints[0]?.verified),
    );
    const hit = await bench.until('stop', () => bench.stops()[0]);
    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
  });

  it('TS без сборки: Node отбрасывает типы, строки совпадают', async () => {
    bench = new Bench();
    await bench.host.setBreakpoints('strip.ts', [6]);
    const run = await bench.host.launch({ program: 'strip.ts' });
    const hit = await bench.until('stop', () => bench.stops()[0]);
    const frames = await bench.host.stack(run.id, hit.session, hit.stop.thread);
    expect(frames[0]).toMatchObject({ line: 6, source: { kind: 'project', path: 'strip.ts' } });
    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
  });

  it('TS через карты исходников: точка в .ts, запускается .js (`__workspaceFolder`)', async () => {
    bench = new Bench();
    await bench.host.setBreakpoints('mapped/src/app.ts', [7]);
    const run = await bench.host.launch({ program: 'mapped/out/app.js' });
    const hit = await bench.until('stop in mapped source', () => bench.stops()[0] ?? (bench.ended(run.id) && 'ended'));
    if (hit === 'ended') throw new Error('program ran past the mapped breakpoint: source maps were not resolved');
    const frames = await bench.host.stack(run.id, hit.session, hit.stop.thread);
    expect(frames[0]).toMatchObject({ name: 'greet', line: 7, source: { kind: 'project', path: 'mapped/src/app.ts' } });
    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
  });

  it('дочерний процесс — дочерний сеанс: точка срабатывает в нём', async () => {
    bench = new Bench();
    await bench.host.setBreakpoints('child.js', [2]);
    const run = await bench.host.launch({ program: 'parent.js' });
    const hit = await bench.until('stop in child', () => bench.stops()[0]);
    const tree = bench.lastRuns().find((one) => one.id === run.id)!;
    const stopped = tree.sessions.find((one) => one.id === hit.session)!;
    const parent = tree.sessions.find((one) => one.id === stopped.parent);
    expect(parent?.parent).not.toBeNull();
    const frames = await bench.host.stack(run.id, hit.session, hit.stop.thread);
    expect(frames[0]).toMatchObject({ line: 2, source: { kind: 'project', path: 'child.js' } });
    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
    expect(bench.output()).toContain('child says 42');
  });

  it('точка, поставленная в работающей программе, срабатывает без перезапуска', async () => {
    bench = new Bench();
    const run = await bench.host.launch({ program: 'ticker.js' });
    await bench.until('ticking', () => bench.output().includes('tick 2'));
    await bench.host.setBreakpoints('ticker.js', [4]);
    const hit = await bench.until('stop on late breakpoint', () => bench.stops()[0]);
    expect(hit.stop.reason).toBe('breakpoint');
    await bench.host.stop(run.id);
    expect(bench.ended(run.id)).toBe(true);
  });

  it('«остановить» гасит программу и адаптер, удержание проекта отпускается', async () => {
    bench = new Bench();
    const run = await bench.host.launch({ program: 'ticker.js' });
    await bench.until('ticking', () => bench.output().includes('tick 1'));
    expect(bench.held.size).toBe(1);
    await bench.host.stop(run.id);
    expect(bench.ended(run.id)).toBe(true);
    expect(bench.held.size).toBe(0);
    const adapter = bench.children[0]!;
    await bench.until('adapter exit', () => adapter.exitCode !== null || adapter.signalCode !== null);
  });

  it('нет программы — отказ до адаптера, а не «отработала за 100 мс»', async () => {
    bench = new Bench();
    await expect(bench.host.launch({ program: 'missing.js' })).rejects.toThrow(/program not found: missing\.js/);
    expect(bench.children).toHaveLength(0);
    expect(bench.held.size).toBe(0);
  });

  it('программа упала на старте — запуск закончен, причина в выводе', async () => {
    bench = new Bench();
    const run = await bench.host.launch({ program: 'crash.js' });
    await bench.until('run end', () => bench.ended(run.id));
    expect(bench.output()).toContain('boom on start');
    expect(bench.held.size).toBe(0);
  });
});

describe('провод DAP', () => {
  function pipe(): { stream: Stream; input: PassThrough; written: Buffer[] } {
    const input = new PassThrough();
    const written: Buffer[] = [];
    const stream: Stream = {
      write: (data) => written.push(Buffer.from(data)),
      on: ((event: string, handler: (...args: unknown[]) => void) => input.on(event, handler)) as Stream['on'],
      destroy: () => input.destroy(),
    };
    return { stream, input, written };
  }

  function frame(message: unknown): Buffer {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
  }

  it('собирает кадр, разрезанный посреди кириллицы', async () => {
    const { stream, input } = pipe();
    const wire = new DapWire(stream);
    const seen: unknown[] = [];
    wire.onEvent((event, body) => seen.push({ event, body }));
    const bytes = frame({ type: 'event', event: 'output', body: { output: 'нота' } });
    const middle = bytes.length - 5;
    input.write(bytes.subarray(0, middle));
    input.write(bytes.subarray(middle));
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen).toEqual([{ event: 'output', body: { output: 'нота' } }]);
  });

  it('обрыв — ответ всем, кто ждёт', async () => {
    const { stream, input } = pipe();
    const wire = new DapWire(stream);
    const waiting = wire.request('threads');
    input.destroy();
    await expect(waiting).rejects.toThrow(/threads/);
    await expect(wire.request('stackTrace')).rejects.toThrow(/stackTrace/);
  });

  it('`initialized` одним куском с ответом на `initialize` не теряется', async () => {
    const { stream, input, written } = pipe();
    const wire = new DapWire(stream);
    const seen = new Set<string>();
    const answered = new Set<number>();
    const tick = setInterval(() => {
      for (const chunk of written) {
        const message = JSON.parse(chunk.toString('utf8').split('\r\n\r\n')[1]!) as { seq: number; command: string };
        if (answered.has(message.seq)) continue;
        answered.add(message.seq);
        seen.add(message.command);
        const reply = (seq: number, command: string) => frame({ type: 'response', request_seq: seq, success: true, command, body: {} });
        if (message.command === 'initialize') {
          input.write(Buffer.concat([reply(message.seq, 'initialize'), frame({ type: 'event', event: 'initialized' })]));
        } else if (message.command === 'configurationDone') {
          const launch = [...answered].find((seq) => seq !== message.seq && seq > 1);
          input.write(Buffer.concat([reply(message.seq, 'configurationDone'), reply(launch ?? 2, 'launch')]));
        }
      }
    }, 5);
    const owner: SessionOwner = {
      breakpoints: () => new Map(),
      toAdapter: (key) => key,
      child: () => undefined,
      changed: () => undefined,
      stopped: () => undefined,
      output: () => undefined,
      verified: () => undefined,
      runInTerminal: null,
      skipped: () => undefined,
    };
    const session = new DapSession('1.0', 'race', null, wire, owner);
    try {
      await Promise.race([
        session.begin('launch', {}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('begin hung: initialized was lost')), 2000)),
      ]);
    } finally {
      clearInterval(tick);
    }
    expect(seen.has('configurationDone')).toBe(true);
    expect(session.state).toBe('running');
  });

  it('встречную просьбу без обработчика отклоняет, а не молчит', () => {
    const { stream, input, written } = pipe();
    new DapWire(stream);
    input.write(frame({ type: 'request', seq: 7, command: 'runInTerminal', arguments: {} }));
    return new Promise<void>((resolve) =>
      setImmediate(() => {
        const answer = JSON.parse(written[0]!.toString('utf8').split('\r\n\r\n')[1]!) as Record<string, unknown>;
        expect(answer).toMatchObject({ type: 'response', request_seq: 7, success: false });
        resolve();
      }),
    );
  });
});

describe('настоящий терминал и файлы за корнем', { timeout: 30_000 }, () => {
  it.skipIf(process.platform === 'win32')('с терминалом программа выполняется В НЁМ: вывод в консоли, остановка — у нас', async () => {
    const consoles: Array<{ command: string; sameShell: string; env: Record<string, string>; out: string }> = [];
    bench = new Bench(shellRunner(consoles));
    await bench.host.setBreakpoints('plain.js', [4]);
    const run = await bench.host.launch({ program: 'plain.js' });
    const hit = await bench.until('stop', () => bench.stops()[0]);
    expect(bench.of<{ name: string }>('terminal')[0]?.name).toBe(`debug::${run.name}`);
    expect(consoles[0]?.command).not.toMatch(/^env /);
    expect(consoles[0]?.env['NODE_OPTIONS']).toContain('bootloader');
    expect(consoles[0]?.sameShell).toMatch(/^env .*NODE_OPTIONS=/);
    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
    await bench.until('console output', () => consoles[0]?.out.includes('sum 6 нота'));
    expect(bench.output()).not.toContain('sum 6 нота');
  });

  it('кадр за корнем: файл читается, но только тот, что назвал адаптер', async () => {
    bench = new Bench(null, path.join(fixtures, 'foreign'));
    const run = await bench.host.launch({ program: 'main.js' });
    const hit = await bench.until('stop on debugger statement', () => bench.stops()[0]);
    const frames = await bench.host.stack(run.id, hit.session, hit.stop.thread);
    const far = frames[0]!;
    expect(far.source?.kind).toBe('file');
    if (far.source?.kind !== 'file') throw new Error('expected a file outside the root');
    expect(far.source.absolute).toBe(path.join(fixtures, 'far.js'));
    const text = await bench.host.readForeign(far.source.absolute);
    expect(text.text).toContain('outside the root');
    await expect(bench.host.readForeign(path.join(fixtures, 'plain.js'))).rejects.toThrow(/not a debugger source/);
    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
  });
});

describe('браузер под отладчиком', { timeout: 60_000 }, () => {
  it('адрес в выводе распознаётся по законченной строке, без цветов и один раз', () => {
    const ready = new ServerReady(new RegExp(DEBUG_DEFAULTS.serverReady));
    expect(ready.feed('\x1b[32mready\x1b[0m listening on http://127.0.0.1:51')).toBeNull();
    expect(ready.feed('234/ (open it)\n')).toBe('http://127.0.0.1:51234/');
    expect(ready.feed('again http://localhost:3000/\n')).toBeNull();
    expect(new ServerReady(new RegExp(DEBUG_DEFAULTS.serverReady)).feed('  - Local:        http://localhost:3000\n')).toBe('http://localhost:3000');
  });

  it.skipIf(NO_CHROME || process.platform === 'win32')(
    'сервер напечатал адрес — открылся браузер, и точка в скрипте страницы сработала',
    async () => {
      const consoles: Array<{ command: string; sameShell: string; env: Record<string, string>; out: string }> = [];
      bench = new Bench(shellRunner(consoles), fixtures, { browserArgs: ['--headless=new'] });
      await bench.host.setBreakpoints('web/app.js', [3]);
      const run = await bench.host.launch({ program: 'web/server.js' });
      const opened = await bench.until('browser session', () => bench.of<{ run: string; url: string }>('browser')[0], 40_000);
      expect(opened.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/web\/$/);
      const hit = await bench.until('stop in the page script', () => bench.stops()[0], 40_000);
      const tree = bench.lastRuns().find((one) => one.id === run.id)!;
      expect(tree.url).toBe(opened.url);
      expect(tree.sessions.find((one) => one.id === hit.session)?.kind).toBe('browser');
      const frames = await bench.host.stack(run.id, hit.session, hit.stop.thread);
      expect(frames[0]).toMatchObject({ name: 'Window.greet', line: 3, source: { kind: 'project', path: 'web/app.js' } });
      const scopes = await bench.host.scopes(run.id, hit.session, frames[0]!.id);
      const locals = await bench.host.variables(run.id, hit.session, scopes[0]!.ref);
      expect(locals.find((one) => one.name === 'who')?.value).toBe("'browser'");
      await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
      await bench.host.stop(run.id);
      expect(bench.ended(run.id)).toBe(true);
    },
  );

  it.skipIf(NO_CHROME)('страницу можно открыть и без сервера — по адресу', async () => {
    bench = new Bench(null, fixtures, { browserArgs: ['--headless=new'] });
    const run = await bench.host.launch({ url: 'about:blank' });
    expect(run.url).toBe('about:blank');
    expect(run.sessions[0]?.kind).toBe('browser');
    await bench.host.stop(run.id);
  });
});

describe('поддельные кадры React', { timeout: 30_000 }, () => {
  it('точка в настоящем файле не срабатывает в подделках `about://React/…`', async () => {
    bench = new Bench();
    await bench.host.setBreakpoints('replayed.js', [2]);
    const run = await bench.host.launch({ program: 'replay.js' });
    const hit = await bench.until('real stop', () => bench.stops()[0]);
    const frames = await bench.host.stack(run.id, hit.session, hit.stop.thread);
    expect(frames[0]).toMatchObject({ name: 'global.replayed', line: 2, source: { kind: 'project', path: 'replayed.js' } });
    await bench.host.step(run.id, hit.session, hit.stop.thread, 'continue');
    await bench.until('run end', () => bench.ended(run.id));
    expect(bench.stops()).toHaveLength(1);
    expect(bench.output()).toContain('real 42');
    expect(bench.output().match(/about:\/\/React/g)).toHaveLength(1);
  });
});
