import { computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import Ajv, { type ValidateFunction } from 'ajv';

interface Entry {
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
    private readonly complain: (message: string) => void,
  ) {}

  declare(key: string, by: string, schema?: object): void {
    const taken = this.schemas.get(key);
    if (taken) {
      this.complain(`ключ реестра «${key}» уже объявлен: ${taken.by}`);
      return;
    }
    if (!schema) return;
    this.schemas.set(key, { by, validate: this.ajv.compile(schema), spec: schema });
    const slot = this.slot(key);
    const kept = slot.peek().filter((entry) => this.check(key, entry));
    if (kept.length !== slot.peek().length) slot.value = kept;
  }

  add<T>(key: string, value: T, by: string): () => void {
    const entry: Entry = { by, value };
    if (!this.check(key, entry)) return () => undefined;
    const slot = this.slot(key);
    slot.value = [...slot.value, entry];
    return () => {
      slot.value = slot.value.filter((item) => item !== entry);
    };
  }

  entries<T>(key: string): ReadonlySignal<Array<{ by: string; value: T }>> {
    return this.slot(key) as unknown as ReadonlySignal<Array<{ by: string; value: T }>>;
  }

  all<T>(key: string): ReadonlySignal<T[]> {
    const slot = this.slot(key);
    let view = this.views.get(key);
    if (!view) {
      view = computed(() => slot.value.map((entry) => entry.value));
      this.views.set(key, view);
    }
    return view as ReadonlySignal<T[]>;
  }

  inspect(key: string, value: unknown): { paths: string[]; why: string } | null {
    const schema = this.schemas.get(key);
    if (!schema || schema.validate(value)) return null;
    const paths = [...new Set((schema.validate.errors ?? []).map((error) => pathOf(error)))].filter(Boolean);
    return { paths, why: why(schema.validate) };
  }

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

  private check(key: string, entry: Entry): boolean {
    const schema = this.schemas.get(key);
    if (!schema) return true;
    if (schema.validate(entry.value)) return true;
    this.complain(`${entry.by} пишет в «${key}» запись не той формы: ${why(schema.validate)}`);
    return false;
  }
}

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
