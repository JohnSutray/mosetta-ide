import { describe, expect, it } from 'vitest';
import { osOf } from '../src/keys/host.js';

describe('какая под нами система', () => {
  it('мак опознаётся во всех трёх видах', () => {
    expect(osOf('macOS')).toBe('mac');
    expect(osOf('MacIntel')).toBe('mac');
    expect(osOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
  });

  it('windows тоже, и тоже в любом написании', () => {
    expect(osOf('Windows')).toBe('win');
    expect(osOf('Win32')).toBe('win');
    expect(osOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('win');
  });

  it('всё остальное — linux, включая пустоту', () => {
    expect(osOf('Linux x86_64')).toBe('linux');
    expect(osOf('')).toBe('linux');
  });
});
