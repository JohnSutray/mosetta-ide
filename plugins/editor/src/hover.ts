import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import type { HoverInfo, Severity } from '@mosetta/ide-plugin-lsp';
import type CodePlugin from '@mosetta/ide-plugin-code';
import { diagnostics } from './diagnostics.js';
import type { HoverSource, HoverSpot } from './schema.js';

/**
 * The hover tooltip. The contents are brought by the language server, while we draw it
 * — with the same dark plate the errors use.
 *
 * And in the same colours as the editor: inside the tooltip lies a signature, i.e.
 * code, and reading it in one shade of grey is exactly as awkward as reading a row in a
 * usage list.
 *
 * The error is shown HERE TOO, and first. A red wave says "something is wrong here" and
 * stays silent about what; asking about it meant asking the problems panel — that is,
 * taking your eyes away from the very place the question is about. In IDEA and in every
 * editor it is one and the same plate, and rightly so.
 */
export function lspHover(
  pathOf: () => string | null,
  ask: (path: string, line: number, character: number) => Promise<HoverInfo | null>,
  /** The code display is a neighbour: painting the signature, and accenting names. */
  code: CodePlugin,
  /** Who else answers — the entries of the `editor.hover` key. Empty means nobody. */
  sources: () => readonly HoverSource[] = () => [],
) {
  return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
    const path = pathOf();
    if (!path) return null;

    const problems = diagnostics.at(view.state as EditorState, pos);

    const line = view.state.doc.lineAt(pos);
    const spot: HoverSpot = { path, line: line.number - 1, character: pos - line.from, text: line.text };
    const [info, ...extra] = await Promise.all([
      ask(path, spot.line, spot.character).catch(() => null),
      ...sources().map((source) => source.hover(spot).catch(() => null)),
    ]);
    const parts = extra.filter((one): one is { code: string } => one !== null);
    if (!info && problems.length === 0 && parts.length === 0) return null;

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
          box.append(...message(problem.message, code.look.palette.class));
          dom.append(box);
        }

        for (const part of parts) dom.append(codeBlock(part.code, path, code));
        if (info) dom.append(codeBlock(stripFences(info.markdown), path, code));
        return { dom };
      },
    };
  }, { hoverTime: 250 });
}

/** A piece of code in the same highlighting as the file. */
function codeBlock(text: string, path: string, code: CodePlugin): HTMLElement {
  const block = document.createElement('div');
  block.className = 'cm-hover-code';
  for (const chunk of code.painter.paint(text, path)) block.append(painted(chunk.text, chunk.color));
  return block;
}

/** The colour of the strip on the left: the same as the wave under the text. */
function tint(severity: Severity): string {
  if (severity === 'warning') return 'var(--warning)';
  if (severity === 'info') return 'var(--info)';
  if (severity === 'hint') return 'var(--hint)';
  return 'var(--error)';
}

/**
 * An error's text is prose, but with code sprinkled in: the language server puts names
 * and types in quotes. Those are what we paint; the rest stays text. Painting the whole
 * message with a parser is pointless: it is not code, and the highlighting would invent
 * a structure that is not there.
 */
function message(text: string, accent: string): Node[] {
  const out: Node[] = [];
  const quoted = /'([^']+)'|`([^`]+)`/g;
  let last = 0;
  for (const found of text.matchAll(quoted)) {
    const at = found.index ?? 0;
    if (at > last) out.push(document.createTextNode(text.slice(last, at)));
    out.push(painted(found[0], accent));
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

/**
 * The server hands over markdown with ```-fenced blocks. A full markdown renderer is
 * not needed for a tooltip: all the value in tsserver's answer is in the signature's
 * code, and the fences around it only get in the way of reading.
 */
function stripFences(markdown: string): string {
  return markdown
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
