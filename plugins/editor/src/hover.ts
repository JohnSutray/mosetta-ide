import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import type { HoverInfo, Severity } from '@ide/protocol';
import { codePainter, darcula } from '@ide/code';

const dc = darcula.palette;
import { diagnostics } from './diagnostics.js';

export function lspHover(
  pathOf: () => string | null,
  ask: (path: string, line: number, character: number) => Promise<HoverInfo | null>,
) {
  return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
    const path = pathOf();
    if (!path) return null;

    const problems = diagnostics.at(view.state as EditorState, pos);

    const line = view.state.doc.lineAt(pos);
    const info = await ask(path, line.number - 1, pos - line.from).catch(() => null);
    if (!info && problems.length === 0) return null;

    return {
      pos,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-hover-card';

        for (const problem of problems) {
          const box = document.createElement('div');
          box.className = 'cm-hover-problem';
          box.style.borderColor = tint(problem.severity);
          box.append(...message(problem.message));
          dom.append(box);
        }

        if (info) {
          const code = document.createElement('div');
          code.className = 'cm-hover-code';
          for (const chunk of codePainter.paint(stripFences(info.markdown), path)) {
            code.append(painted(chunk.text, chunk.color));
          }
          dom.append(code);
        }
        return { dom };
      },
    };
  }, { hoverTime: 250 });
}

function tint(severity: Severity): string {
  if (severity === 'warning') return dc.warnFg;
  if (severity === 'info') return dc.number;
  if (severity === 'hint') return dc.comment;
  return dc.errorFg;
}

function message(text: string): Node[] {
  const out: Node[] = [];
  const quoted = /'([^']+)'|`([^`]+)`/g;
  let last = 0;
  for (const found of text.matchAll(quoted)) {
    const at = found.index ?? 0;
    if (at > last) out.push(document.createTextNode(text.slice(last, at)));
    out.push(painted(found[0], dc.class));
    last = at + found[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

function painted(text: string, color: string | null): Node {
  if (!color) return document.createTextNode(text);
  const span = document.createElement('span');
  span.style.color = color;
  span.textContent = text;
  return span;
}

function stripFences(markdown: string): string {
  return markdown
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
