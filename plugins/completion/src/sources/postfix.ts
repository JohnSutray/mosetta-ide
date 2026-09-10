import type { Answer, Ask, Item, Source } from '../types.js';

interface Template {
  name: string;
  shape: string;
}

const TEMPLATES: readonly Template[] = [
  { name: 'log', shape: 'console.log($expr)$0' },
  { name: 'if', shape: 'if ($expr) {\n  $0\n}' },
  { name: 'not', shape: '!$expr$0' },
  { name: 'return', shape: 'return $expr;$0' },
  { name: 'const', shape: 'const $0 = $expr;' },
  { name: 'let', shape: 'let $0 = $expr;' },
  { name: 'for', shape: 'for (const item of $expr) {\n  $0\n}' },
  { name: 'await', shape: 'await $expr$0' },
  { name: 'par', shape: '($expr)$0' },
  { name: 'typeof', shape: 'typeof $expr$0' },
];

const SCRIPTS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs']);

export class Postfix implements Source {
  readonly id = 'postfix';
  readonly weight = -4;

  items(ask: Ask): Answer {
    const dot = ask.from - 1;
    if (ask.text[dot] !== '.' || !SCRIPTS.has(this.extension(ask.path))) return { items: [] };
    const start = this.expressionStart(ask.text, dot);
    if (start === null) return { items: [] };
    const expr = ask.text.slice(start, dot);
    const lineStart = ask.text.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(ask.text.slice(lineStart, start))?.[0] ?? '';
    return { items: TEMPLATES.map((template) => this.item(template, expr, start, indent)) };
  }

  private item(template: Template, expr: string, from: number, indent: string): Item {
    const [head = '', tail = ''] = template.shape.replace(/\n/g, `\n${indent}`).split('$0');
    const fill = (part: string) => part.split('$expr').join(expr);
    const before = fill(head);
    return {
      label: template.name,
      kind: 'postfix',
      source: this.id,
      from,
      insert: before + fill(tail),
      caret: before.length,
      detail: template.shape.replace('$0', '').split('$expr').join('expr').replace(/\n\s*/g, ' '),
    };
  }

  expressionStart(text: string, dot: number): number | null {
    let at = dot;
    let depth = 0;
    while (at > 0) {
      const ch = text[at - 1]!;
      if (ch === ')' || ch === ']') {
        depth += 1;
      } else if (ch === '(' || ch === '[') {
        if (depth === 0) break;
        depth -= 1;
      } else if (!(depth > 0 || /[\w$.]/.test(ch) || ((ch === '?' || ch === '!') && text[at] === '.'))) {
        break;
      }
      at -= 1;
    }
    const expr = text.slice(at, dot);
    if (expr === '' || depth > 0 || /^\d/.test(expr) || expr.startsWith('.')) return null;
    return at;
  }

  private extension(path: string): string {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const at = name.lastIndexOf('.');
    return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
  }
}
