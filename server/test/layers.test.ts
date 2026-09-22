import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The layers must not spill over one another. A rule recorded only in a comment lives
 * until the first "but going straight there is faster", so this one is recorded here
 * and fails in red.
 *
 * * the RAM filesystem (layer 2) — downwards only through the OS layer
 * * the OS filesystem (layer 3) — the only one allowed to touch `node:fs`
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/**
 * Who is allowed to touch disk directly. The list is closed — that is the whole point:
 * the OS layer, its watching half, and the half of THAT where the recursion is ours
 * rather than the OS's; the config store, which reads its own `settings.json`; the
 * defaults, because the factory keymap is shipped as package data; the one-off move from
 * the old `keymap.json`; the search for a program along the user's PATH; the plugin
 * host with its shared table, which reads package manifests and the contract's source;
 * and the static server, which reads the client's own build rather than the project.
 */
const MAY_TOUCH_DISK = [
  'fs/os-fs.ts',
  'fs/watcher.ts',
  'fs/dir-watch.ts',
  'config/store.ts',
  'config/defaults.ts',
  'config/legacy.ts',
  'env/which.ts',
  'plugins/host.ts',
  'plugins/shared.ts',
  'static.ts',
];

/**
 * Who is supposed to spawn subprocesses.
 *
 * The list is OPEN, unlike the disk one: a direct `spawn` is not forbidden — server
 * code is entitled to launch whatever it likes. Something else is required: saying so
 * out loud, as a line here, and naming the reason. Otherwise what already happened
 * happens again — four launch sites, four different timeouts, a launch plan bypassing
 * three of them, and nowhere to see the live processes.
 *
 * Two lines so far: the process layer, which exists for this, and the terminal's host,
 * because `node-pty` opens a device rather than a pipe and the two share no signature.
 */
const MAY_SPAWN = [
  'env/processes.ts',
  'term/host.ts',
];

/** The forbidden arrows: what may not import what. */
const FORBIDDEN: Array<{ from: RegExp; importing: RegExp; why: string }> = [
  {
    from: /^fs\/ram-fs\.ts$/,
    importing: /node:fs/,
    why: 'the memory layer goes down only through OsFs',
  },
  {
    from: /^fs\//,
    importing: /(\.\.\/plugins\/)/,
    why: 'the dependency goes strictly downwards: a lower layer knows nothing of the ones above',
  },
  {
    from: /^fs\//,
    importing: /(\.\.\/rpc\/|\.\.\/methods\/)/,
    why: 'the layers know nothing of sessions or of the transport',
  },
  {
    from: /^git\//,
    importing: /(node:fs|ram-fs|os-fs|\.\.\/rpc\/|\.\.\/methods\/)/,
    why: 'git is an axis of its own: it has its own source of truth (.git) and its own process, and it never reads our layers',
  },
  {
    from: /^plugins\//,
    importing: /(ram-fs|os-fs|file-index|\.\.\/git\/)/,
    why: 'the plugin host knows about the machine and about building, while a project\'s data reaches a plugin at call time',
  },
  {
    from: /^env\//,
    importing: /(ram-fs|os-fs|file-index)/,
    why: 'the environment looks at the machine rather than at a project\'s data — otherwise it becomes one more layer',
  },
];

async function sources(): Promise<Array<{ rel: string; text: string }>> {
  const out: Array<{ rel: string; text: string }> = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.ts')) {
        out.push({
          rel: path.relative(SRC, full).split(path.sep).join('/'),
          text: await fs.readFile(full, 'utf8'),
        });
      }
    }
  }
  await walk(SRC);
  return out;
}

function importsOf(text: string): string[] {
  return [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
}

describe('the layers do not spill over', () => {
  it('only whoever is supposed to touches disk', async () => {
    const offenders: string[] = [];
    for (const { rel, text } of await sources()) {
      if (MAY_TOUCH_DISK.includes(rel)) continue;
      const bad = importsOf(text).filter((i) => i === 'node:fs' || i === 'node:fs/promises');
      if (bad.length) offenders.push(`${rel} → ${bad.join(', ')}`);
    }
    expect(
      offenders,
      `these files reached for node:fs past the OS layer:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('subprocesses are born where they are supposed to be', async () => {
    const offenders: string[] = [];
    for (const { rel, text } of await sources()) {
      if (MAY_SPAWN.includes(rel)) continue;
      const bad = importsOf(text).filter((i) => i === 'node:child_process' || i === 'node-pty');
      if (bad.length) offenders.push(`${rel} → ${bad.join(', ')}`);
    }
    expect(
      offenders,
      'these files start a process past `env/processes` — which is allowed, but write ' +
        `them into MAY_SPAWN with a reason:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it.each(FORBIDDEN)('$why', async ({ from, importing, why }) => {
    const offenders: string[] = [];
    for (const { rel, text } of await sources()) {
      if (!from.test(rel)) continue;
      const bad = importsOf(text).filter((i) => importing.test(i));
      if (bad.length) offenders.push(`${rel} → ${bad.join(', ')}`);
    }
    expect(offenders, `${why}\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the test sees real files rather than emptiness', async () => {
    const files = await sources();
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.rel === 'fs/os-fs.ts')).toBe(true);
    expect(files.some((f) => f.rel === 'fs/ram-fs.ts')).toBe(true);
  });
});

/**
 * The server writes outside the project only where it was told to.
 *
 * The rule was recorded as a decision and got broken all the same, a second time: two
 * tests brought a server up directly, without a state directory, and it honestly wrote
 * the history of open projects into the user's home. A live human LOST their own
 * projects over it — twelve history slots stuffed with temporary fixtures.
 *
 * So the rule is now executable: in tests, only the helper brings a server up, and it
 * substitutes a temporary state directory.
 */
describe('the machine\'s state', () => {
  it('the tests bring a server up only through the helpers', async () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const guilty: string[] = [];
    for (const name of await fs.readdir(dir)) {
      if (!name.endsWith('.test.ts')) continue;
      const text = await fs.readFile(path.join(dir, name), 'utf8');
      if (/\bboot\.start\s*\(/.test(text)) guilty.push(name);
    }
    expect(guilty, 'boot.start directly — the history will travel into the user\'s home').toEqual([]);
  });
});
