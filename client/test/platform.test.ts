import { describe, expect, it } from 'vitest';
import { KeyHostInfo } from '../src/keys/host.js';

describe('какая под нами система', () => {
  it('мак опознаётся во всех трёх видах', () => {
    expect(KeyHostInfo.osOf('macOS')).toBe('mac');
    expect(KeyHostInfo.osOf('MacIntel')).toBe('mac');
    expect(KeyHostInfo.osOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
  });

  it('windows тоже, и тоже в любом написании', () => {
    expect(KeyHostInfo.osOf('Windows')).toBe('win');
    expect(KeyHostInfo.osOf('Win32')).toBe('win');
    expect(KeyHostInfo.osOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('win');
  });

  it('всё остальное — linux, включая пустоту', () => {
    expect(KeyHostInfo.osOf('Linux x86_64')).toBe('linux');
    expect(KeyHostInfo.osOf('')).toBe('linux');
  });
});

describe('окружение подставляется', () => {
  it('мак в браузере: ведёт Cmd, области от частного к общему', () => {
    const host = new KeyHostInfo('macOS', 'browser');
    expect(host.isMac).toBe(true);
    expect(host.primary).toBe('meta');
    expect(host.scopes).toEqual(['browser', 'browser:mac']);
    expect(host.scopesExactFirst).toEqual(['browser:mac', 'browser']);
    expect(host.humanize('meta+shift+s')).toBe('Cmd+Shift+S');
    expect(host.humanize('alt+backquote')).toBe('Option+`');
  });

  it('Windows в Электроне: ведёт Control, и подписи другие', () => {
    const host = new KeyHostInfo('Windows NT 10.0', 'electron');
    expect(host.primary).toBe('control');
    expect(host.scopes).toEqual(['electron', 'electron:win']);
    expect(host.humanize('meta+s')).toBe('Win+S');
    expect(host.humanize('alt+s')).toBe('Alt+S');
  });

  it('двойное нажатие показывается ритмом, а не плюсом', () => {
    expect(new KeyHostInfo('macOS').humanize('double:shift')).toBe('Shift Shift');
  });
});
