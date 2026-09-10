import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChoiceStore } from '../src/choice-store.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-choices-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('история выборов на диске', () => {
  it('переживает перезапуск: новый экземпляр читает то, что записал старый', async () => {
    const store = new ChoiceStore(() => dir);
    expect(await store.add('log')).toBe(1);
    expect(await store.add('log')).toBe(2);
    expect(await new ChoiceStore(() => dir).load()).toEqual({ log: 2 });
  });

  it('выборы разом из разных вкладок засчитаны все', async () => {
    const store = new ChoiceStore(() => dir);
    await Promise.all(Array.from({ length: 20 }, () => store.add('bind')));
    expect(await new ChoiceStore(() => dir).load()).toEqual({ bind: 20 });
  });

  it('потолок выбрасывает самое редкое, только что выбранное остаётся', async () => {
    const store = new ChoiceStore(() => dir, 3);
    await store.add('often');
    await store.add('often');
    await store.add('rare');
    await store.add('mid');
    await store.add('mid');
    await store.add('fresh');
    expect(Object.keys(await store.load()).sort()).toEqual(['fresh', 'mid', 'often']);
  });

  it('испорченный файл — чистый лист, а не падение', async () => {
    await fs.writeFile(path.join(dir, 'choices.json'), '{ сломано', 'utf8');
    const store = new ChoiceStore(() => dir);
    expect(await store.load()).toEqual({});
    expect(await store.add('call')).toBe(1);
  });
});
