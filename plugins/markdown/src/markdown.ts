
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong' | 'em' | 'strike'; parts: Inline[] }
  | { kind: 'link'; href: string; parts: Inline[] }
  | { kind: 'image'; src: string; alt: string };

export type Block =
  | { kind: 'heading'; level: number; parts: Inline[] }
  | { kind: 'paragraph'; parts: Inline[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; items: Block[][] }
  | { kind: 'rule' }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] };

export class Markdown {
  blocks(text: string): Block[] {
    return this.parse(text.replace(/\r\n?/g, '\n').split('\n'));
  }

  private parse(lines: string[]): Block[] {
    const out: Block[] = [];
    let at = 0;
    while (at < lines.length) {
      const line = lines[at]!;

      if (line.trim() === '') {
        at += 1;
        continue;
      }

      const fence = /^\s*(```+|~~~+)\s*([^\s`]*)/.exec(line);
      if (fence) {
        const close = fence[1]!;
        const body: string[] = [];
        at += 1;
        while (at < lines.length && !lines[at]!.trim().startsWith(close)) {
          body.push(lines[at]!);
          at += 1;
        }
        at += 1;
        out.push({ kind: 'code', lang: fence[2] ?? '', text: body.join('\n') });
        continue;
      }

      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        out.push({ kind: 'heading', level: heading[1]!.length, parts: this.inline(heading[2]!.replace(/\s+#+\s*$/, '')) });
        at += 1;
        continue;
      }

      if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) {
        out.push({ kind: 'rule' });
        at += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const body: string[] = [];
        while (at < lines.length && (/^\s*>/.test(lines[at]!) || (body.length > 0 && lines[at]!.trim() !== ''))) {
          body.push(lines[at]!.replace(/^\s*>\s?/, ''));
          at += 1;
        }
        out.push({ kind: 'quote', blocks: this.parse(body) });
        continue;
      }

      if (line.includes('|') && at + 1 < lines.length && /^\s*\|?[\s:-]*-[\s|:-]*$/.test(lines[at + 1]!)) {
        const head = this.cells(line);
        at += 2;
        const rows: Inline[][][] = [];
        while (at < lines.length && lines[at]!.includes('|') && lines[at]!.trim() !== '') {
          rows.push(this.cells(lines[at]!));
          at += 1;
        }
        out.push({ kind: 'table', head, rows });
        continue;
      }

      const bullet = this.bullet(line);
      if (bullet) {
        const ordered = bullet.ordered;
        const items: Block[][] = [];
        while (at < lines.length) {
          const mark = this.bullet(lines[at]!);
          if (!mark || mark.ordered !== ordered) break;
          const body = [mark.rest];
          at += 1;
          while (at < lines.length && (lines[at]!.startsWith('  ') || lines[at]!.trim() === '')) {
            if (lines[at]!.trim() === '' && !this.more(lines, at)) break;
            body.push(lines[at]!.replace(/^ {2}/, ''));
            at += 1;
          }
          items.push(this.parse(body));
        }
        out.push({ kind: 'list', ordered, items });
        continue;
      }

      const body: string[] = [];
      while (at < lines.length && lines[at]!.trim() !== '' && !this.starts(lines[at]!)) {
        body.push(lines[at]!);
        at += 1;
      }
      if (body.length === 0) {
        body.push(lines[at]!);
        at += 1;
      }
      out.push({ kind: 'paragraph', parts: this.inline(body.join('\n')) });
    }
    return out;
  }

  private starts(line: string): boolean {
    return (
      /^(#{1,6})\s+/.test(line) ||
      /^\s*(```+|~~~+)/.test(line) ||
      /^\s*>/.test(line) ||
      this.bullet(line) !== null ||
      /^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)
    );
  }

  private more(lines: string[], at: number): boolean {
    for (let i = at + 1; i < lines.length; i += 1) {
      if (lines[i]!.trim() === '') continue;
      return lines[i]!.startsWith('  ');
    }
    return false;
  }

  private bullet(line: string): { ordered: boolean; rest: string } | null {
    const dash = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
    if (dash) return { ordered: false, rest: dash[1]! };
    const number = /^\s{0,3}\d+[.)]\s+(.*)$/.exec(line);
    if (number) return { ordered: true, rest: number[1]! };
    return null;
  }

  private cells(line: string): Inline[][] {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((one) => this.inline(one.trim()));
  }

  inline(text: string): Inline[] {
    const out: Inline[] = [];
    let plain = '';
    let at = 0;
    const flush = () => {
      if (plain !== '') out.push({ kind: 'text', text: plain });
      plain = '';
    };

    while (at < text.length) {
      const rest = text.slice(at);

      const code = /^(`+)([\s\S]*?)\1/.exec(rest);
      if (code) {
        flush();
        out.push({ kind: 'code', text: code[2]!.trim() });
        at += code[0].length;
        continue;
      }

      const image = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/.exec(rest);
      if (image) {
        flush();
        out.push({ kind: 'image', alt: image[1]!, src: image[2]! });
        at += image[0].length;
        continue;
      }

      const link = /^\[([^\]]*)\]\(([^)\s]+)[^)]*\)/.exec(rest);
      if (link) {
        flush();
        out.push({ kind: 'link', href: link[2]!, parts: this.inline(link[1]!) });
        at += link[0].length;
        continue;
      }

      const strong = /^(\*\*|__)([\s\S]+?)\1/.exec(rest);
      if (strong) {
        flush();
        out.push({ kind: 'strong', parts: this.inline(strong[2]!) });
        at += strong[0].length;
        continue;
      }

      const strike = /^~~([\s\S]+?)~~/.exec(rest);
      if (strike) {
        flush();
        out.push({ kind: 'strike', parts: this.inline(strike[1]!) });
        at += strike[0].length;
        continue;
      }

      const em = /^\*([^\s*][\s\S]*?)\*/.exec(rest);
      if (em && (at === 0 || /[\s([{]/.test(text[at - 1]!))) {
        flush();
        out.push({ kind: 'em', parts: this.inline(em[1]!) });
        at += em[0].length;
        continue;
      }

      const bare = /^<((?:https?|mailto):[^>\s]+)>/.exec(rest);
      if (bare) {
        flush();
        out.push({ kind: 'link', href: bare[1]!, parts: [{ kind: 'text', text: bare[1]! }] });
        at += bare[0].length;
        continue;
      }

      plain += text[at];
      at += 1;
    }
    flush();
    return out;
  }
}
