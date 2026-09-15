import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Versions } from '../bin/versions.mjs';

describe('уборка старых версий', () => {
  let apps;

  beforeEach(() => {
    apps = fs.mkdtempSync(path.join(os.tmpdir(), 'mosetta-apps-'));
    for (const version of ['0.1.0', '0.2.0', '0.3.0']) {
      fs.mkdirSync(path.join(apps, version, 'node_modules'), { recursive: true });
      fs.writeFileSync(path.join(apps, version, 'node_modules', 'blob'), Buffer.alloc(1024 * 10));
    }
    fs.symlinkSync(path.join(apps, '0.3.0'), path.join(apps, 'current'), 'dir');
  });

  afterEach(() => {
    fs.rmSync(apps, { recursive: true, force: true });
  });

  it('видит версии, но не ссылку current', () => {
    expect(new Versions(apps).installed().sort()).toEqual(['0.1.0', '0.2.0', '0.3.0']);
  });

  it('знает, куда показывает current, и не падает без него', () => {
    const versions = new Versions(apps);
    expect(versions.currentName(path.join(apps, 'current'))).toBe('0.3.0');
    expect(versions.currentName(path.join(apps, 'нет'))).toBeNull();
  });

  it('правило — чистое: остаются названные, null в списке не мешает', () => {
    const versions = new Versions(apps);
    expect(versions.doomed(['0.1.0', '0.2.0', '0.3.0'], ['0.4.0', '0.3.0'])).toEqual(['0.1.0', '0.2.0']);
    expect(versions.doomed(['0.1.0'], ['0.1.0', null])).toEqual([]);
  });

  it('удаляет остальное и называет размер', () => {
    const removed = new Versions(apps).prune(['0.3.0', '0.2.0']);
    expect(removed.map((one) => one.name)).toEqual(['0.1.0']);
    expect(removed[0].bytes).toBe(1024 * 10);
    expect(fs.existsSync(path.join(apps, '0.1.0'))).toBe(false);
    expect(fs.existsSync(path.join(apps, '0.2.0'))).toBe(true);
    expect(fs.existsSync(path.join(apps, 'current'))).toBe(true);
  });

  it('папки нет — удалять нечего, и это не ошибка', () => {
    expect(new Versions(path.join(apps, 'нет')).prune(['x'])).toEqual([]);
  });

  it('размер печатается мегабайтами', () => {
    expect(Versions.megabytes(472 * 1024 * 1024)).toBe('472 MB');
  });
});
