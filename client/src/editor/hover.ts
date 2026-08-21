import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { HoverInfo } from '@ide/protocol';

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
        dom.textContent = stripFences(info.markdown);
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
