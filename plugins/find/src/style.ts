export const STYLE = `
.editor .cm-panels.cm-panels-top { border-bottom: 1px solid var(--divider); background: var(--panel-bg); }
.find-bar { display: flex; flex-direction: column; gap: 4px; padding: 4px 6px; font: 12px var(--ui-font); color: var(--fg); }
.find-row { display: flex; align-items: center; gap: 4px; }
.find-field { flex: 1; min-width: 0; font: 12px var(--ui-font); resize: none; }
textarea.find-field { font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; line-height: 1.3; }
.find-tool {
  flex: none;
  height: 22px;
  min-width: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 3px;
  background: var(--control-bg);
  color: var(--fg);
  font: 11px var(--ui-font);
  cursor: default;
}
.find-tool:hover { background: var(--control-bg-hover); }
.find-tool.is-on { background: var(--treesel); color: #fff; }
.find-count { flex: none; min-width: 48px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
.find-count.is-none { color: var(--error); }
.find-spacer { flex: none; width: 24px; }
.editor .cm-searchMatch { background: #32593d; }
.editor .cm-searchMatch.cm-searchMatch-selected { background: #2f5c8f; }
`;
