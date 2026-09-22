#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What the registry actually has, next to what this checkout says.
 *
 * A release of forty packages is interrupted by whatever interrupts it — an expired
 * one-time code, a staged version the registry will not let you write over — and it
 * stops halfway without saying which half. Then `latest` points at a version whose
 * dependencies are not published, and nothing installs. So the question "is the release
 * whole?" gets an answer in one command, asked of the registry with the cache turned
 * off: npm's own cache lies for minutes after a publish.
 */
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function packages() {
  const dirs = ['protocol', 'server', 'client', 'app', 'desktop'];
  for (const name of await fs.readdir(path.join(repo, 'plugins'))) dirs.push(path.join('plugins', name));
  const out = [];
  for (const dir of dirs) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(repo, dir, 'package.json'), 'utf8'));
      if (manifest.private) continue;
      out.push({ dir, name: manifest.name, version: manifest.version });
    } catch {}
  }
  return out;
}

async function published(name) {
  const answer = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  if (answer.status === 404) return null;
  if (!answer.ok) throw new Error(`${name}: the registry answered ${answer.status}`);
  const body = await answer.json();
  return { latest: body['dist-tags']?.latest ?? null, versions: Object.keys(body.versions ?? {}) };
}

const wanted = await packages();
const rows = await Promise.all(
  wanted.map(async (one) => {
    const there = await published(one.name);
    const has = there?.versions.includes(one.version) ?? false;
    const latest = there?.latest ?? null;
    return { ...one, latest, has, missing: !there };
  }),
);

const behind = rows.filter((row) => !row.has);
const stale = rows.filter((row) => row.has && row.latest !== row.version);
for (const row of behind) {
  console.log(`${row.missing ? 'not on npm' : `latest ${row.latest}`} — ${row.name}@${row.version} is not published`);
}
for (const row of stale) console.log(`latest is ${row.latest}, not ${row.version} — ${row.name}`);
console.log(
  `${rows.length - behind.length} of ${rows.length} packages are on npm at ${wanted[0]?.version ?? '?'}` +
    (behind.length === 0 && stale.length === 0 ? ' — the release is whole' : ''),
);
process.exit(behind.length === 0 && stale.length === 0 ? 0 : 1);
