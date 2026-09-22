import { afterEach, describe, expect, it } from 'vitest';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProcessHandle, Project, ProjectMemory, ProjectResource } from '@mosetta/ide-api/server';
import { TerminalHost } from '../src/host.js';

/** A decoy project: it remembers the holds and everything it was told. */
class FakeProject implements Project {
  readonly heard: Array<{ event: string; payload: unknown }> = [];
  readonly holds: string[] = [];
  readonly listed: string[] = [];
  private readonly resources = new Map<string, ProjectResource>();

  constructor(
    readonly root: string,
    readonly name = 'a project',
  ) {}

  use<T extends ProjectResource>(key: string, create: () => T): T {
    const existing = this.resources.get(key);
    if (existing) return existing as T;
    const made = create();
    this.resources.set(key, made);
    return made;
  }

  emit(event: string, payload: unknown): void {
    this.heard.push({ event, payload });
  }

  start(): ProcessHandle {
    throw new Error('there are no long-lived processes in this test: a pty is born by itself');
  }

  settings<T extends object>(_section: string, defaults: T): T {
    return defaults;
  }

  readonly memory: ProjectMemory = {
    on: () => () => undefined,
    files: () => [],
    docSync: () => null,
    peekDoc: async (path) => ({ path, text: '', version: 0, openCount: 0 }),
    isTextual: () => false,
    disk: async () => null,
    settle: async () => undefined,
    adopt: async () => undefined,
  };

  hold(reason: string): () => void {
    this.holds.push(reason);
    return () => {
      const at = this.holds.indexOf(reason);
      if (at !== -1) this.holds.splice(at, 1);
    };
  }

  resolve(relative: string): string {
    return path.join(this.root, relative);
  }

  spawned(info: { command: string }, _kill: () => void): () => void {
    this.listed.push(info.command);
    return () => {
      const at = this.listed.indexOf(info.command);
      if (at !== -1) this.listed.splice(at, 1);
    };
  }
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

/** The user's shell: in a test we take the system's, and without banners. */
const shell = () => ({
  file: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
  args: [] as string[],
  env: {} as Record<string, string>,
});

const hosts: TerminalHost[] = [];
const dirs: string[] = [];

function make(root: string): { host: TerminalHost; project: FakeProject } {
  const project = new FakeProject(root);
  const host = new TerminalHost(project, silent, shell);
  hosts.push(host);
  return { host, project };
}

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-term-plugin-'));
  dirs.push(dir);
  return dir;
}

/** We wait for what we need to appear in the output: a pty prints when it feels like it. */
function waitForOutput(project: FakeProject, name: string, want: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      const text = project.heard
        .filter((one) => one.event === 'data')
        .map((one) => one.payload as { name: string; data: string })
        .filter((one) => one.name === name)
        .map((one) => one.data)
        .join('');
      if (text.includes(want)) {
        clearInterval(tick);
        resolve(text);
      } else if (Date.now() - started > 15_000) {
        clearInterval(tick);
        reject(new Error(`never saw «${want}», we saw: ${text.slice(-300)}`));
      }
    }, 50);
  });
}

afterEach(async () => {
  for (const host of hosts.splice(0)) host.dispose();
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

describe('terminals', () => {
  it('there is a real console under the terminal', async () => {
    const root = await tempDir();
    const { host, project } = make(root);
    const info = host.create({ cwd: root });

    host.write(info.name, 'echo live-console\r');
    expect(await waitForOutput(project, info.name, 'live-console')).toContain('live-console');
  }, 25_000);

  it('every manual terminal is a new one and gets a name of its own', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const names = [
      host.create({ cwd: root }),
      host.create({ cwd: root }),
      host.create({ cwd: root }),
    ];

    expect(names.map((one) => one.name)).toEqual(['manual', 'manual-2', 'manual-3']);
    expect(new Set(names.map((one) => one.pid)).size).toBe(3);
    expect(host.list()).toHaveLength(3);
  }, 25_000);

  it('a name that has come free is reused', async () => {
    const root = await tempDir();
    const { host } = make(root);
    host.create({ cwd: root });
    host.create({ cwd: root });
    host.close('manual');

    expect(host.create({ cwd: root }).name).toBe('manual');
  }, 25_000);

  it('one name, one terminal', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const first = host.open({ name: '@ide/core::dev', kind: 'script', cwd: root });
    const second = host.open({ name: '@ide/core::dev', kind: 'script', cwd: root });

    expect(second.pid).toBe(first.pid);
    expect(host.list()).toHaveLength(1);
  }, 25_000);

  it('the chip shows the short name rather than the long one', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const info = host.open({ name: '@distrojs/core::dev', kind: 'script', cwd: root });

    expect(info.name).toBe('@distrojs/core::dev');
    expect(info.title).toBe('core::dev');
  }, 25_000);

  it('it survives the tab leaving and hands over the accumulated output', async () => {
    const root = await tempDir();
    const { host, project } = make(root);
    const info = host.create({ cwd: root });
    host.write(info.name, 'echo i-survived\r');
    await waitForOutput(project, info.name, 'i-survived');

    const { buffer, info: same } = host.attach(info.name);
    expect(same.alive).toBe(true);
    expect(buffer).toContain('i-survived');
  }, 25_000);

  it('a live terminal holds the project, a closed one lets it go', async () => {
    const root = await tempDir();
    const { host, project } = make(root);
    const info = host.create({ cwd: root });
    expect(project.holds).toEqual([`terminal ${info.name}`]);
    expect(project.listed).toHaveLength(1);

    host.close(info.name);
    expect(project.holds).toEqual([]);
    expect(project.listed).toEqual([]);
  }, 25_000);

  it('busyness is either honestly computed or honestly declared unknown', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const info = host.create({ cwd: root });

    if (process.platform === 'win32') {
      expect(info.busyUnknown).toBeTruthy();
    } else {
      expect(info.busyUnknown).toBeUndefined();
      expect(info.busy).toBe(false);
    }
  }, 25_000);

  it('a dead one is restarted under the same name', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const first = host.open({ name: 'a script', kind: 'script', cwd: root, command: 'exit 0' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(host.list()[0]?.alive).toBe(false);

    const second = host.open({ name: 'a script', kind: 'script', cwd: root, command: 'exit 0' });
    expect(second.name).toBe('a script');
    expect(second.pid).not.toBe(first.pid);
    expect(host.list()).toHaveLength(1);
  }, 25_000);

  it('runIn runs the command: at a live prompt as a line, in a busy one afresh', async () => {
    const root = await tempDir();
    const project = new FakeProject(root);
    const own = process.platform !== 'win32' && process.env['SHELL'] ? process.env['SHELL'] : shell().file;
    const host = new TerminalHost(project, silent, () => ({ ...shell(), file: own }));
    hosts.push(host);
    const echo = process.platform === 'win32' ? 'Write-Output' : 'echo';
    host.runIn({ name: 'debug::x', cwd: root, command: `${echo} first-run` });
    await waitForOutput(project, 'debug::x', 'first-run');
    const before = host.list().find((one) => one.name === 'debug::x')!.pid;
    host.runIn({ name: 'debug::x', cwd: root, command: `${echo} second-run` });
    await waitForOutput(project, 'debug::x', 'second-run');
    expect(host.list().find((one) => one.name === 'debug::x')!.pid).toBe(before);
    expect(host.list().filter((one) => one.name === 'debug::x')).toHaveLength(1);
  });

  it('closing the project kills every terminal', async () => {
    const root = await tempDir();
    const { host } = make(root);
    host.create({ cwd: root });
    host.create({ cwd: root });
    expect(host.list()).toHaveLength(2);

    host.dispose();
    expect(host.list()).toEqual([]);
  }, 25_000);
});
