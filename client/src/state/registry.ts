import { computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import Ajv, { type ValidateFunction } from 'ajv';

/**
 * The shared store of declarations.
 *
 * The core has stopped being an ORACLE. It used to know it had a toolbar: the button
 * registry lived in the core, the core drew them, and turning the toolbar off was
 * impossible — it was part of the base. But a toolbar is our idea of what an IDE looks
 * like rather than a property of an IDE: a person is entitled to tear it down and live
 * with a command palette or a grid of icons.
 *
 * So the core holds only the MECHANISM: a key, the shape of an entry, and who wrote it.
 * What the key `toolbar.button` means is known to whoever declared it and reads it. If
 * nobody reads it, the entries simply lie there, and that is not an error.
 *
 * Three roles, and they differ:
 *
 * * declared (`declare`) — named the key and the shape. Usually whoever intends to read it;
 * * wrote (`add`) — put an entry in. Knows the key's name and nothing else: whether a reader exists is unknown to them;
 * * read (`all`) — took it as a signal and drew it.
 *
 * An object rather than module variables: the store has an owner, and a test sets up
 * its own instead of inheriting somebody else's state.
 */

interface Entry {
  /** Who wrote it: a plugin's name, or `core`. Needed for a comprehensible refusal. */
  by: string;
  value: unknown;
}

interface Schema {
  by: string;
  validate: ValidateFunction;
  spec: object;
}

export class Registry {
  private readonly slots = new Map<string, Signal<Entry[]>>();
  private readonly schemas = new Map<string, Schema>();
  private readonly views = new Map<string, ReadonlySignal<unknown[]>>();
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  constructor(
    /**
     * Where to complain. As a parameter rather than an import: the registry knows
     * nothing about notifications, and a test wants to read the complaints as a list.
     */
    private readonly complain: (message: string) => void,
  ) {}

  /**
   * Declare a key and the shape of its entries.
   *
   * Also checks what is already there: entries arrive before the schema does, because a
   * writer is not required to wait for a reader.
   */
  declare(key: string, by: string, schema?: object): void {
    const taken = this.schemas.get(key);
    if (taken) {
      this.complain(`registry key «${key}» is already declared by: ${taken.by}`);
      return;
    }
    if (!schema) return;
    this.schemas.set(key, { by, validate: this.ajv.compile(schema), spec: schema });
    const slot = this.slot(key);
    const kept = slot.peek().filter((entry) => this.check(key, entry));
    if (kept.length !== slot.peek().length) slot.value = kept;
  }

  /**
   * Add an entry. Returns a withdrawal: when a plugin is unloaded, its entries go.
   *
   * An entry of the wrong shape IS NOT PUT IN. The registry used to complain and put it
   * in anyway — so a toolbar button without a command reached the render, and what
   * reached the human was not a complaint but a breakage. The complaint names names as
   * it is; refusing makes it required reading.
   */
  add<T>(key: string, value: T, by: string): () => void {
    const entry: Entry = { by, value };
    if (!this.check(key, entry)) return () => undefined;
    const slot = this.slot(key);
    slot.value = [...slot.value, entry];
    return () => {
      slot.value = slot.value.filter((item) => item !== entry);
    };
  }

  /**
   * The same as `all`, but WITH AUTHORS.
   *
   * Who wrote an entry is not a housekeeping field: for settings the author IS the
   * layer (factory, mine, the project's), and folding the layers is read from here.
   */
  entries<T>(key: string): ReadonlySignal<Array<{ by: string; value: T }>> {
    return this.slot(key) as unknown as ReadonlySignal<Array<{ by: string; value: T }>>;
  }

  /**
   * Everything the key holds. A signal: a reader redraws by itself.
   *
   * A view onto a key is created ONCE and remembered: a `computed` per read would spawn
   * a subscription on every render.
   */
  all<T>(key: string): ReadonlySignal<T[]> {
    const slot = this.slot(key);
    let view = this.views.get(key);
    if (!view) {
      view = computed(() => slot.value.map((entry) => entry.value));
      this.views.set(key, view);
    }
    return view as ReadonlySignal<T[]>;
  }

  /**
   * Validate a value against the key's shape WITHOUT putting it in.
   *
   * `null` means it fits (or there is no schema). Otherwise: the paths of the fields
   * that did not fit, and a complaint in words. Needed by whoever can repair their own
   * value: the settings layer throws out a spoiled key and applies the rest instead of
   * disappearing whole.
   */
  inspect(key: string, value: unknown): { paths: string[]; why: string } | null {
    const schema = this.schemas.get(key);
    if (!schema || schema.validate(value)) return null;
    const paths = [...new Set((schema.validate.errors ?? []).map((error) => pathOf(error)))].filter(Boolean);
    return { paths, why: why(schema.validate) };
  }

  /** What exists at all: for the registry window, and for tests. */
  describe(): Array<{ key: string; schema?: object; declaredBy?: string; count: number }> {
    const keys = new Set([...this.slots.keys(), ...this.schemas.keys()]);
    return [...keys].sort().map((key) => {
      const schema = this.schemas.get(key);
      return {
        key,
        ...(schema ? { schema: schema.spec, declaredBy: schema.by } : {}),
        count: this.slots.get(key)?.peek().length ?? 0,
      };
    });
  }

  private slot(key: string): Signal<Entry[]> {
    let found = this.slots.get(key);
    if (!found) {
      found = signal<Entry[]>([]);
      this.slots.set(key, found);
    }
    return found;
  }

  /**
   * Whether an entry fits the key's shape. No schema means it fits — there may be no
   * reader either.
   */
  private check(key: string, entry: Entry): boolean {
    const schema = this.schemas.get(key);
    if (!schema) return true;
    if (schema.validate(entry.value)) return true;
    this.complain(`${entry.by} writes an entry of the wrong shape into «${key}»: ${why(schema.validate)}`);
    return false;
  }
}

/**
 * Which FIELD of the value did not fit: `/startOnOpen` for a wrong type, `/extra` for
 * an unknown one. Ajv names an unknown field as a parameter rather than as a path, so
 * we glue it together ourselves — otherwise there would be nothing to throw out.
 */
function pathOf(error: { instancePath?: string; params?: unknown }): string {
  const params = error.params as Record<string, unknown> | undefined;
  const extra = params?.['additionalProperty'];
  const base = error.instancePath ?? '';
  return typeof extra === 'string' ? `${base}/${extra}` : base;
}

export function why(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => {
      const where = error.instancePath || '/';
      const params = error.params as Record<string, unknown> | undefined;
      const named = params?.['additionalProperty'] ?? params?.['missingProperty'];
      const extra = typeof named === 'string' ? ` «${named}»` : '';
      return `${where} ${error.message ?? ''}${extra}`;
    })
    .join('; ');
}
