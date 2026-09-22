import { describe, expect, it } from 'vitest';
import { KeyHostInfo } from '../src/host.js';

/**
 * What system we are on is decided by ONE line, and the whole layout depends on it: the
 * leading modifier, what the system and the browser have taken away, which chords apply
 * at all.
 *
 * The test came dear. `navigator.platform` was declared deprecated, it was replaced
 * with `userAgentData.platform` and compared against `Mac` — and that answers `macOS`,
 * with a small letter. The IDE quietly moved to the Windows layout: Option+4 stopped
 * working, and the hint advised Control+Alt+9. That is not caught by eye — it looks
 * like "the key does not work", and people go looking in the layout file.
 */
describe('what system we are on', () => {
  it('a Mac is recognised in all three spellings', () => {
    expect(KeyHostInfo.osOf('macOS')).toBe('mac');
    expect(KeyHostInfo.osOf('MacIntel')).toBe('mac');
    expect(KeyHostInfo.osOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
  });

  it('Windows too, and in any spelling as well', () => {
    expect(KeyHostInfo.osOf('Windows')).toBe('win');
    expect(KeyHostInfo.osOf('Win32')).toBe('win');
    expect(KeyHostInfo.osOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('win');
  });

  it('everything else is linux, emptiness included', () => {
    expect(KeyHostInfo.osOf('Linux x86_64')).toBe('linux');
    expect(KeyHostInfo.osOf('')).toBe('linux');
  });
});

/**
 * And the thing the environment became a class for: it can now be SUBSTITUTED. `IS_MAC`
 * used to be computed at import time, and there was nothing to check somebody else's
 * machine with — the layout's tests walked the worlds by hand.
 */
describe('the environment can be substituted', () => {
  it('a Mac in the browser: Cmd leads, the scopes go from the particular to the general', () => {
    const host = new KeyHostInfo('macOS', 'browser');
    expect(host.isMac).toBe(true);
    expect(host.primary).toBe('meta');
    expect(host.scopes).toEqual(['browser', 'browser:mac']);
    expect(host.scopesExactFirst).toEqual(['browser:mac', 'browser']);
    expect(host.humanize('meta+shift+s')).toBe('Cmd+Shift+S');
    expect(host.humanize('alt+backquote')).toBe('Option+`');
  });

  it('Windows in Electron: Control leads, and the captions are different', () => {
    const host = new KeyHostInfo('Windows NT 10.0', 'electron');
    expect(host.primary).toBe('control');
    expect(host.scopes).toEqual(['electron', 'electron:win']);
    expect(host.humanize('meta+s')).toBe('Win+S');
    expect(host.humanize('alt+s')).toBe('Alt+S');
  });

  it('a double press is shown as a rhythm rather than with a plus', () => {
    expect(new KeyHostInfo('macOS').humanize('double:shift')).toBe('Shift Shift');
  });
});
