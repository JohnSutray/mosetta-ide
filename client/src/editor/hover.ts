import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { HoverInfo } from '@ide/protocol';
import { paintCode } from './paint-line.js';

export function lspHover(
  pathOf: () => string | null,
  ask: (path: string, line: number, character: number) => Promise<HoverInfo | null>,
) {
  return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
    const path = pathOf();
    if (!path) return null;

    const line = view.state.doc.lineAt(pos);
    const info = await ask(path, line.number - 1, pos - line.from).catch(() => null);
    if (!info) return null;

    return {
      pos,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-hover-card';
        for (const chunk of paintCode(stripFences(info.markdown), path)) {
          if (!chunk.color) {
            dom.append(chunk.text);
            continue;
          }
          const span = document.createElement('span');
          span.style.color = chunk.color;
          span.textContent = chunk.text;
          dom.append(span);
        }
        return { dom };
      },
    };
  }, { hoverTime: 250 });
}

function stripFences(markdown: string): string {
  return markdown
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
