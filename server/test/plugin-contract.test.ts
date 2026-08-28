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

const HOST_ONLY = '--- то, чем пользуется ХОСТ';

function forPlugins(text: string): string {
  const at = text.indexOf(HOST_ONLY);
  expect(at, 'в пакете нет черты «хостовое ниже»').toBeGreaterThan(0);
  return text.slice(0, at);
}

function forHost(text: string): string {
  return text.slice(text.indexOf(HOST_ONLY));
}

function surfaceMembers(text: string): string[] {
  const at = text.indexOf('export interface ClientSurface');
  const body = text.slice(text.indexOf('{', at) + 1, text.indexOf('\n}', at));
  return [...body.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]!);
}

describe('контракт @ide/api', () => {
  it('всё, что плагин может импортировать, сборка умеет подменить', () => {
    const text = source('client.ts');
    const offered = new Set([...injected(text), ...real(forPlugins(text))]);
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
    const offered = new Set(real(forPlugins(text)));
    for (const name of sharedNames('@ide/api/server')) {
      expect(offered.has(name), `${name} есть в SHARED, но не объявлен в @ide/api/server`).toBe(
        true,
      );
    }
  });

  it('хостовое наружу не отдаётся', () => {
    for (const file of ['client.ts', 'server.ts'] as const) {
      const shared = sharedNames(`@ide/api/${file === 'client.ts' ? 'client' : 'server'}`);
      for (const name of real(forHost(source(file)))) {
        expect(shared, `${name} — для хоста, плагину он приедет пустым`).not.toContain(name);
      }
    }
  });

  it('приложение обязано отдать ровно то, что объявлено injected', () => {
    const text = source('client.ts');
    expect(injected(text).length).toBeGreaterThan(3);
    expect(surfaceMembers(text).sort()).toEqual(injected(text).sort());
  });
});
