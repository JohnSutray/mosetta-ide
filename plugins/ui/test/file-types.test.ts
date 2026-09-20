import { describe, expect, it } from 'vitest';
import { fileTypes } from '../src/index.js';

/**
 * The file type table. The test guards two things: the resolution order (the particular
 * beats the general), and that a caption will physically fit the plate — three
 * characters maximum, otherwise mush at sixteen pixels.
 */
describe('a file\'s type by name', () => {
  it('an extension is recognised in any case', () => {
    expect(fileTypes.of('index.ts').label).toBe('TS');
    expect(fileTypes.of('Index.TS').label).toBe('TS');
    expect(fileTypes.of('app.tsx').label).toBe('TSX');
  });

  it('a whole name beats an extension', () => {
    expect(fileTypes.of('package.json').label).toBe('npm');
    expect(fileTypes.of('config.json').label).toBe('{}');
  });

  it('a tail beats an extension: declarations and build litter', () => {
    expect(fileTypes.of('globals.d.ts').label).toBe('D');
    expect(fileTypes.of('app.tsbuildinfo').label).toBe('··');
    expect(fileTypes.of('server.ts').label).toBe('TS');
  });

  it('a family of configs is recognised by the name\'s beginning', () => {
    expect(fileTypes.of('tsconfig.json').label).toBe('TS');
    expect(fileTypes.of('tsconfig.build.json').label).toBe('TS');
  });

  it('a file with no extension and a dotfile do not break the parsing', () => {
    expect(fileTypes.of('.gitignore').label).toBe('git');
    expect(fileTypes.of('LICENSE')).toEqual(fileTypes.plain);
    expect(fileTypes.of('')).toEqual(fileTypes.plain);
  });

  it('an unfamiliar extension means just a sheet of paper rather than an invented caption', () => {
    expect(fileTypes.of('archive.qqq')).toEqual(fileTypes.plain);
  });

  it('the caption fits the plate, and the colours are real ones', () => {
    const all = fileTypes.all();
    for (const type of all) {
      expect(type.label.length).toBeGreaterThan(0);
      expect(type.label.length).toBeLessThanOrEqual(3);
      expect(type.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(type.ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('the tables\' keys are written in lower case — otherwise the row is dead', () => {
    const keys = fileTypes.keys();
    for (const key of keys) expect(key).toBe(key.toLowerCase());
  });
});
