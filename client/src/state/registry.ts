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
  private readonly entries = new Map<string, Signal<Entry[]>>();
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
    for (const entry of this.slot(key).peek()) this.check(key, entry);
  }

  add<T>(key: string, value: T, by: string): () => void {
    const entry: Entry = { by, value };
    const slot = this.slot(key);
    this.check(key, entry);
    slot.value = [...slot.value, entry];
    return () => {
      slot.value = slot.value.filter((item) => item !== entry);
    };
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

  describe(): Array<{ key: string; schema?: object; declaredBy?: string; count: number }> {
    const keys = new Set([...this.entries.keys(), ...this.schemas.keys()]);
    return [...keys].sort().map((key) => {
      const schema = this.schemas.get(key);
      return {
        key,
        ...(schema ? { schema: schema.spec, declaredBy: schema.by } : {}),
        count: this.entries.get(key)?.peek().length ?? 0,
      };
    });
  }

  private slot(key: string): Signal<Entry[]> {
    let found = this.entries.get(key);
    if (!found) {
      found = signal<Entry[]>([]);
      this.entries.set(key, found);
    }
    return found;
  }

  private check(key: string, entry: Entry): void {
    const schema = this.schemas.get(key);
    if (!schema) return;
    if (schema.validate(entry.value)) return;
    this.complain(`${entry.by} пишет в «${key}» запись не той формы: ${why(schema.validate)}`);
  }
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
