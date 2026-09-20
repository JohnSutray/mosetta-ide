import type { CommandHandler } from './server.js';

/**
 * The plugin system's own plumbing on the server side: what the HOST uses, and what a
 * plugin never gets.
 *
 * A module of its own, for the same reason as on the client side: the boundary between
 * "for plugins" and "for the host" has to be structure rather than a comment the build
 * reads literally.
 */

interface Hooks {
  start?: () => unknown;
}

const declared = new WeakMap<object, Map<string, CommandHandler>>();
const hooks = new WeakMap<object, Hooks>();

/** Host: a method declared by `@command` on this instance. */
export function declareMethod(target: object, name: string, method: CommandHandler): void {
  const now = declared.get(target) ?? new Map<string, CommandHandler>();
  now.set(name, method);
  declared.set(target, now);
}

/** Host: the lifecycle method a decorator handed over. */
export function setHook(target: object, start: () => unknown): void {
  hooks.set(target, { ...hooks.get(target), start });
}

/** Host: which methods the plugin declared through `@command`. */
export function declaredOf(instance: object): Map<string, CommandHandler> {
  return declared.get(instance) ?? new Map();
}

/** Host: what the plugin declared through the lifecycle annotations. */
export function hooksOf(instance: object): Hooks {
  return hooks.get(instance) ?? {};
}
