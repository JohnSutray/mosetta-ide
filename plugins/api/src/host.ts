import type {
  DeclaredCommand,
  Ide,
  PluginSpec,
  RegistrySpec,
  SettingsSection,
} from './client.js';

/**
 * The plugin system's own plumbing: what the HOST uses, and what a plugin never gets.
 *
 * A module of its own rather than a marked-off half of the contract. The boundary used
 * to be a comment, and the build read it literally — it split the contract's source on
 * that line to decide which names go onto the shared table. A comment carrying the load
 * of syntax breaks the first time someone tidies the comments up, and it did.
 *
 * Now the boundary is the module: `client.ts` re-exports these names, so importing them
 * still works, but nothing here matches the build's search for offered names, and a
 * plugin asking for `attach` gets the honest \"not on the table\".
 *
 * The tables live here too, beside their readers. They are keyed by the instance or the
 * class rather than written onto it: a property appended to somebody else's object shows
 * up in its type, in `Object.keys` and in the debugger, whereas the whole point is that a
 * plugin's surface consists only of what its author made public.
 */

const declared = new WeakMap<object, RegistrySpec[]>();
const sections = new WeakMap<object, SettingsSection[]>();
const passports = new WeakMap<object, PluginSpec>();
const declaredCommands = new WeakMap<object, DeclaredCommand[]>();

/** Host: the tables the decorators write into. */
export const tables = { declared, sections, passports, declaredCommands };

/** Host: which commands this instance declared. The order is the order in the class. */
export function commandsOf(instance: object): DeclaredCommand[] {
  return declaredCommands.get(instance) ?? [];
}

/** Host: which registries this class declared. Readable right after the import. */
export function registriesOf(ctor: object): RegistrySpec[] {
  return declared.get(ctor) ?? [];
}

/** Host: the class's passport; `null` means the plugin did not name itself. */
export function passportOf(ctor: object): PluginSpec | null {
  return passports.get(ctor) ?? null;
}

/** Host: which settings sections this class declared. */
export function sectionsOf(ctor: object): SettingsSection[] {
  return sections.get(ctor) ?? [];
}

/** The shape of an entry in the `settings` key: declared by the core, written by the host. */
export const SETTINGS_SCHEMA = {
  type: 'object',
  required: ['section', 'defaults', 'owner', 'title'],
  additionalProperties: false,
  properties: {
    section: { type: 'string' },
    defaults: { type: 'object' },
    fields: { type: 'object' },
    schema: { type: 'object' },
    editor: {},
    owner: { type: 'string' },
    title: { type: 'string' },
  },
} as const;

interface Hooks {
  start?: () => unknown;
}

const hooks = new WeakMap<object, Hooks>();
const services = new WeakMap<object, Ide>();

/** Host: "here are this instance's services". Called right after `new`. */
export function attach(instance: object, ide: Ide): void {
  services.set(instance, ide);
}

/** Host: what the plugin declared by annotation. */
export function hooksOf(instance: object): Hooks {
  return hooks.get(instance) ?? {};
}

/** Host: the decorators in the contract hand their lifecycle method over here. */
export function setHook(target: object, start: () => unknown): void {
  hooks.set(target, { ...hooks.get(target), start });
}

/** The services of the instance a remote method was called on. */
export function ideOf(instance: object): Ide {
  const found = services.get(instance);
  if (!found) {
    throw new Error('the plugin was created past the plugin system: its services are not attached');
  }
  return found;
}
