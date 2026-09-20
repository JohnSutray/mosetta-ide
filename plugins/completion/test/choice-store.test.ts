import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChoiceStore } from '../src/choice-store.js';

/**
 * The history of choices on the server. Three promises: it survives a restart, two
 * choices at once are both counted, and the ceiling throws out the rarest rather than
 * what was just chosen.
 */
let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-choices-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the history of choices on disk', () => {
  it('survives a restart: a new instance reads what the old one wrote', async () => {
    const store = new ChoiceStore(() => dir);
    expect(await store.add('log')).toBe(1);
    expect(await store.add('log')).toBe(2);
    expect(await new ChoiceStore(() => dir).load()).toEqual({ log: 2 });
  });

  it('choices made at once from different tabs are all counted', async () => {
    const store = new ChoiceStore(() => dir);
    await Promise.all(Array.from({ length: 20 }, () => store.add('bind')));
    expect(await new ChoiceStore(() => dir).load()).toEqual({ bind: 20 });
  });

  it('the ceiling throws out the rarest, what was just chosen stays', async () => {
    const store = new ChoiceStore(() => dir, 3);
    await store.add('often');
    await store.add('often');
    await store.add('rare');
    await store.add('mid');
    await store.add('mid');
    await store.add('fresh');
    expect(Object.keys(await store.load()).sort()).toEqual(['fresh', 'mid', 'often']);
  });

  it('a corrupt file is a clean slate rather than a crash', async () => {
    await fs.writeFile(path.join(dir, 'choices.json'), '{ broken', 'utf8');
    const store = new ChoiceStore(() => dir);
    expect(await store.load()).toEqual({});
    expect(await store.add('call')).toBe(1);
  });
});
