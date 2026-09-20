/**
 * Browser globals for a plugin's tests.
 *
 * A plugin's client half is browser code, yet it runs under Node. That got away
 * with it while plugins only touched their own pure functions; the first one to
 * bring in SOMEONE ELSE'S library fell over on the import, before reaching the
 * first `it` — xterm looks for `self` as it loads.
 *
 * A full jsdom is both unnecessary and harmful here: it pretends we have a DOM,
 * and the test starts checking the DOM rather than the plugin. What is here is
 * exactly what foreign packages need in order to load, and not one line more.
 * The same file as the core's test setup, for the same reason.
 */

const globals = globalThis as Record<string, unknown>;

globals['self'] ??= globalThis;

/** xterm reads `navigator.userAgent` as it loads. */
globals['navigator'] ??= { userAgent: 'node' };
