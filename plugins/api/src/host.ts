import type {
  DeclaredCommand,
  Ide,
  PluginSpec,
  RegistrySpec,
  SettingsSection,
} from './client.js';

const declared = new WeakMap<object, RegistrySpec[]>();
const sections = new WeakMap<object, SettingsSection[]>();
const passports = new WeakMap<object, PluginSpec>();
const declaredCommands = new WeakMap<object, DeclaredCommand[]>();

export const tables = { declared, sections, passports, declaredCommands };

export function commandsOf(instance: object): DeclaredCommand[] {
  return declaredCommands.get(instance) ?? [];
}

export function registriesOf(ctor: object): RegistrySpec[] {
  return declared.get(ctor) ?? [];
}

export function passportOf(ctor: object): PluginSpec | null {
  return passports.get(ctor) ?? null;
}

export function sectionsOf(ctor: object): SettingsSection[] {
  return sections.get(ctor) ?? [];
}

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

export function attach(instance: object, ide: Ide): void {
  services.set(instance, ide);
}

export function hooksOf(instance: object): Hooks {
  return hooks.get(instance) ?? {};
}

export function setHook(target: object, start: () => unknown): void {
  hooks.set(target, { ...hooks.get(target), start });
}

export function ideOf(instance: object): Ide {
  const found = services.get(instance);
  if (!found) {
    throw new Error('плагин создан мимо плагинной системы: службы не прикреплены');
  }
  return found;
}
