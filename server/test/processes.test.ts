import { describe, expect, it } from 'vitest';
import { Env } from '../src/env/env.js';

/**
 * The base launching layer.
 *
 * A class rather than a shared instance: the ledger of live processes is state, and a
 * test that shares it with the next test will one day start depending on the order.
 * Each has its own `new Processes()`.
 *
 * We launch a real `node`: a fake would check nothing here — the whole point of the
 * layer is how it treats a REAL subprocess.
 */
const node = process.execPath;

/** A script for `node -e`: shorter, and it needs no temporary files. */
function script(body: string): string[] {
  return ['-e', body];
}

describe('launching subprocesses', () => {
  it('the output arrives whole, and the exit code is visible', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write("hello"); process.exit(0)'),
      reason: 'a test',
    });
    expect(ran.ok).toBe(true);
    expect(ran.stdout).toBe('hello');
    expect(ran.code).toBe(0);
    expect(ran.timedOut).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('only our own may be finished off — and together with its descendants', async () => {
    const env = new Env();
    const processes = env.processes;
    const handle = processes.start({
      command: node,
      args: script('const { spawn } = require("node:child_process"); spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]); setInterval(() => {}, 1000);'),
      reason: 'a test',
    });
    const pid = handle.child.pid!;
    await new Promise((done) => setTimeout(done, 400));
    const kids = (await env.memory.descendants(pid)) ?? [];
    expect(kids.length).toBeGreaterThan(0);

    expect(await processes.killTree(pid)).toBeGreaterThanOrEqual(2);
    await new Promise((done) => setTimeout(done, 200));
    for (const one of [pid, ...kids]) expect(() => process.kill(one, 0)).toThrow();

    await expect(processes.killTree(process.pid)).rejects.toThrow(/is not ours/);
  });

  it('somebody else\'s refusal is an answer rather than an exception', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stderr.write("not like that"); process.exit(3)'),
      reason: 'a test',
    });
    expect(ran.ok).toBe(false);
    expect(ran.code).toBe(3);
    expect(ran.stderr).toBe('not like that');
  });

  it('a command that does not exist does not bring the request down', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: 'surely-not-on-this-machine',
      args: [],
      reason: 'a test',
    });
    expect(ran.ok).toBe(false);
    expect(ran.code).toBe(null);
    expect(ran.stderr).not.toBe('');
  });

  it('one that hangs is killed and says it was killed by the timeout', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'a test',
      timeoutMs: 150,
    });
    expect(ran.timedOut).toBe(true);
    expect(ran.ok).toBe(false);
  });

  it('an overflowing output is SAID out loud rather than swallowed', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write("x".repeat(200000))'),
      reason: 'a test',
      maxBuffer: 1024,
    });
    expect(ran.truncated).toBe(true);
    expect(ran.ok).toBe(false);
    expect(ran.stderr).toContain('1024');
  });

  it('the stream hands the output over as it appears rather than at the end', async () => {
    const processes = new Env().processes;
    const seen: string[] = [];
    const ran = await processes.stream(
      {
        command: node,
        args: script(
          'process.stdout.write("one\\n"); setTimeout(() => process.stdout.write("two\\n"), 60)',
        ),
        reason: 'a test',
      },
      (chunk) => seen.push(chunk),
    );
    expect(ran.ok).toBe(true);
    expect(seen.join('')).toContain('one');
    expect(seen.join('')).toContain('two');
    expect(seen.length).toBeGreaterThan(1);
  });

  it('both streams flow into one: progress is printed to stderr', async () => {
    const processes = new Env().processes;
    const seen: string[] = [];
    await processes.stream(
      {
        command: node,
        args: script('process.stderr.write("this is progress")'),
        reason: 'a test',
      },
      (chunk) => seen.push(chunk),
    );
    expect(seen.join('')).toContain('this is progress');
  });

  it('the ledger shows the living and forgets the dead', async () => {
    const processes = new Env().processes;
    const handle = processes.start({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'a long liver',
      owner: '/project',
    });

    const alive = processes.alive();
    expect(alive).toHaveLength(1);
    expect(alive[0]!.reason).toBe('a long liver');
    expect(alive[0]!.owner).toBe('/project');
    expect(alive[0]!.adopted).toBe(false);

    const dead = new Promise<void>((resolve) => handle.child.once('exit', () => resolve()));
    handle.kill();
    await dead;
    expect(processes.alive()).toEqual([]);
  });

  it('closing a project clears up what was orphaned', async () => {
    const processes = new Env().processes;
    const orphan = processes.start({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'a long fetch',
      owner: '/project',
    });
    const other = processes.start({
      command: node,
      args: script('setInterval(() => {}, 1000)'),
      reason: 'somebody else\'s',
      owner: '/another',
    });

    const dead = new Promise<void>((resolve) => orphan.child.once('exit', () => resolve()));
    expect(processes.killOwned('/project')).toBe(1);
    await dead;

    expect(processes.alive().map((one) => one.reason)).toEqual(['somebody else\'s']);
    other.kill();
  });

  it('an adopted process is visible in the ledger but is not killed along with somebody else\'s', async () => {
    const processes = new Env().processes;
    let killed = false;
    const forget = processes.adopt(
      { pid: 4242, command: 'zsh', reason: 'terminal root::dev', owner: '/project' },
      () => (killed = true),
    );

    expect(processes.alive()[0]!.adopted).toBe(true);
    expect(processes.killOwned('/project')).toBe(0);
    expect(killed).toBe(false);

    forget();
    expect(processes.alive()).toEqual([]);
  });

  it('the "machine-readable" intention reaches the process', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write(String(process.env.LC_ALL))'),
      reason: 'a test',
      wants: ['machine-readable'],
    });
    expect(ran.stdout).toBe('C');
  });

  it('the "do not ask" intention silences the password prompt', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write(String(process.env.GIT_TERMINAL_PROMPT))'),
      reason: 'a test',
      wants: ['no-prompts'],
    });
    expect(ran.stdout).toBe('0');
  });

  it('your own variables beat an intention: a tool knows more about itself', async () => {
    const processes = new Env().processes;
    const ran = await processes.run({
      command: node,
      args: script('process.stdout.write(String(process.env.LC_ALL))'),
      reason: 'a test',
      wants: ['machine-readable'],
      env: { LC_ALL: 'ru_RU.UTF-8' },
    });
    expect(ran.stdout).toBe('ru_RU.UTF-8');
  });
});
