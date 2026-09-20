/*
 * Checking the registry of keys taken away from us.
 *
 * WHY BY HAND. This cannot be checked automatically: tools like CDP send a press
 * straight into the page, past the very layer of the browser that decides whether to
 * keep the event or hand it over. Calibrated on Cmd+L — the event reached the page while
 * the address bar did not take the focus, though nobody called `preventDefault`. So the
 * layer was bypassed, and any conclusion drawn from such a press is worth nothing.
 *
 * WHAT IT MEANS. A key is decided by ONE fact: does `keydown` reach the page. It did —
 * the key is ours, and it is swallowed by `preventDefault` (in the registry that is
 * `soft: true`). It did not — the browser handled it at home, and there is nothing to
 * intercept with.
 *
 * HOW TO USE IT. Paste it into the console on the IDE's page, press whatever you are
 * curious about in turn, then `ide.probe.report()`. The script swallows everything it
 * catches, so tabs will not switch and the page will neither be saved nor printed. Three
 * chords it does not swallow, and should not: Cmd+W, Cmd+N and Cmd+Q never reach the page
 * at all, and there is no point pressing them.
 */
(() => {
  const seen = new Map();
  const name = (event) => {
    const parts = [];
    if (event.metaKey) parts.push('meta');
    if (event.ctrlKey) parts.push('control');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    parts.push(event.code.replace(/^Key|^Digit/, '').toLowerCase());
    return parts.join('+');
  };

  const handler = (event) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) return;
    seen.set(name(event), { cancelable: event.cancelable, at: seen.size + 1 });
    event.preventDefault();
    event.stopPropagation();
  };

  window.addEventListener('keydown', handler, true);

  globalThis.ide = globalThis.ide ?? {};
  globalThis.ide.probe = {
    /** What reached the page is ours. */
    report() {
      const rows = [...seen.entries()].map(([key, info]) => ({
        key,
        'reached the page': 'yes',
        'swallowed by a prevent': info.cancelable ? 'yes' : 'NO',
      }));
      console.table(rows);
      console.log('What is not in the table never reached the page: the browser handled it at home.');
      return rows.map((row) => row.key);
    },
    stop() {
      window.removeEventListener('keydown', handler, true);
      console.log('the listener is off');
    },
  };

  console.log('Press keys, then ide.probe.report(). To stop: ide.probe.stop()');
})();
