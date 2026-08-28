import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedNames } from '../src/plugins/build.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const api = path.resolve(here, '../../plugins/api/src');

function source(file: string): string {
  return fs.readFileSync(path.join(api, file), 'utf8');
}

function injected(text: string): string[] {
  return [...text.matchAll(/^export declare (?:function|const) (\w+)/gm)].map((m) => m[1]!);
}

function real(text: string): string[] {
  return [...text.matchAll(/^export (?:abstract class|function) (\w+)/gm)].map((m) => m[1]!);
}

function surfaceMembers(text: string): string[] {
  const at = text.indexOf('export interface ClientSurface');
  const body = text.slice(text.indexOf('{', at) + 1, text.indexOf('\n}', at));
  return [...body.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]!);
}

describe('контракт @ide/api', () => {
  it('всё, что плагин может импортировать, сборка умеет подменить', () => {
    const text = source('client.ts');
    const offered = new Set([...injected(text), ...real(text)]);
    for (const name of sharedNames('@ide/api/client')) {
      expect(offered.has(name), `${name} есть в SHARED, но не объявлен в @ide/api/client`).toBe(
        true,
      );
    }
    for (const name of injected(text)) {
      expect(
        sharedNames('@ide/api/client'),
        `${name} объявлен в @ide/api/client, но плагину его не отдают`,
      ).toContain(name);
    }
  });

  it('серверная половина сшита так же', () => {
    const text = source('server.ts');
    const offered = new Set(real(text));
    for (const name of sharedNames('@ide/api/server')) {
      expect(offered.has(name), `${name} есть в SHARED, но не объявлен в @ide/api/server`).toBe(
        true,
      );
    }
  });

  it('приложение обязано отдать ровно то, что объявлено injected', () => {
    const text = source('client.ts');
    expect(injected(text).length).toBeGreaterThan(3);
    expect(surfaceMembers(text).sort()).toEqual(injected(text).sort());
  });
});
