import { afterEach, describe, expect, it } from 'vitest';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProcessHandle, Project, ProjectMemory, ProjectResource } from '@ide/api/server';
import { TerminalHost } from '../src/host.js';

class FakeProject implements Project {
  readonly heard: Array<{ event: string; payload: unknown }> = [];
  readonly holds: string[] = [];
  readonly listed: string[] = [];
  private readonly resources = new Map<string, ProjectResource>();

  constructor(
    readonly root: string,
    readonly name = 'проект',
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
    throw new Error('долгоживущих процессов в этом тесте нет: pty рождается сам');
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
        reject(new Error(`не дождались «${want}», видели: ${text.slice(-300)}`));
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

describe('терминалы', () => {
  it('под терминалом настоящая консоль', async () => {
    const root = await tempDir();
    const { host, project } = make(root);
    const info = host.create({ cwd: root });

    host.write(info.name, 'echo живая-консоль\r');
    expect(await waitForOutput(project, info.name, 'живая-консоль')).toContain('живая-консоль');
  }, 25_000);

  it('каждый ручной терминал новый и получает своё имя', async () => {
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

  it('освободившееся имя переиспользуется', async () => {
    const root = await tempDir();
    const { host } = make(root);
    host.create({ cwd: root });
    host.create({ cwd: root });
    host.close('manual');

    expect(host.create({ cwd: root }).name).toBe('manual');
  }, 25_000);

  it('одно имя — один терминал', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const first = host.open({ name: '@ide/core::dev', kind: 'script', cwd: root });
    const second = host.open({ name: '@ide/core::dev', kind: 'script', cwd: root });

    expect(second.pid).toBe(first.pid);
    expect(host.list()).toHaveLength(1);
  }, 25_000);

  it('чип показывает короткое имя, а не длинное', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const info = host.open({ name: '@distrojs/core::dev', kind: 'script', cwd: root });

    expect(info.name).toBe('@distrojs/core::dev');
    expect(info.title).toBe('core::dev');
  }, 25_000);

  it('переживает уход вкладки и отдаёт накопленный вывод', async () => {
    const root = await tempDir();
    const { host, project } = make(root);
    const info = host.create({ cwd: root });
    host.write(info.name, 'echo я-пережил\r');
    await waitForOutput(project, info.name, 'я-пережил');

    const { buffer, info: same } = host.attach(info.name);
    expect(same.alive).toBe(true);
    expect(buffer).toContain('я-пережил');
  }, 25_000);

  it('живой терминал держит проект, закрытый — отпускает', async () => {
    const root = await tempDir();
    const { host, project } = make(root);
    const info = host.create({ cwd: root });
    expect(project.holds).toEqual([`терминал ${info.name}`]);
    expect(project.listed).toHaveLength(1);

    host.close(info.name);
    expect(project.holds).toEqual([]);
    expect(project.listed).toEqual([]);
  }, 25_000);

  it('занятость либо честно считается, либо честно объявлена неизвестной', async () => {
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

  it('умерший перезапускается под тем же именем', async () => {
    const root = await tempDir();
    const { host } = make(root);
    const first = host.open({ name: 'скрипт', kind: 'script', cwd: root, command: 'exit 0' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(host.list()[0]?.alive).toBe(false);

    const second = host.open({ name: 'скрипт', kind: 'script', cwd: root, command: 'exit 0' });
    expect(second.name).toBe('скрипт');
    expect(second.pid).not.toBe(first.pid);
    expect(host.list()).toHaveLength(1);
  }, 25_000);

  it('закрытие проекта гасит все терминалы', async () => {
    const root = await tempDir();
    const { host } = make(root);
    host.create({ cwd: root });
    host.create({ cwd: root });
    expect(host.list()).toHaveLength(2);

    host.dispose();
    expect(host.list()).toEqual([]);
  }, 25_000);
});
