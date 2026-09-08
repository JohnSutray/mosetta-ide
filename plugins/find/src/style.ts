export const STYLE = `
.editor .cm-panels.cm-panels-top { border-bottom: 1px solid var(--divider); background: var(--panel-bg); }
.find-bar { display: flex; flex-direction: column; gap: 3px; padding: 3px 6px; font: 12px var(--ui-font); color: var(--fg); }
.find-row { display: flex; align-items: center; gap: 4px; }
.find-field { flex: 1; min-width: 0; height: 22px; padding: 0 6px; box-sizing: border-box; font: 12px var(--ui-font); resize: none; }
textarea.find-field { height: auto; padding: 3px 6px; font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; line-height: 1.3; }
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
.find-tool:disabled { opacity: 0.5; }
.find-count { flex: none; min-width: 48px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
.find-count.is-none { color: var(--error); }
.find-spacer { flex: none; width: 24px; }
.editor .cm-searchMatch { background: #32593d; }
.editor .cm-searchMatch.cm-searchMatch-selected { background: #2f5c8f; }

.fif { display: flex; flex-direction: column; overflow: hidden; }
.fif-head { flex: none; border-bottom: 1px solid var(--divider); padding: 6px 10px; display: flex; flex-direction: column; gap: 6px; }
.fif-row { display: flex; align-items: center; gap: 6px; }
.fif-icon { color: var(--muted); font-size: 15px; flex: none; width: 16px; text-align: center; }
.fif-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--fg);
  font: 15px/1.3 var(--font);
  cursor: text;
}
.fif-input::placeholder { color: var(--muted); }
.fif-count { color: var(--muted); flex: none; font-variant-numeric: tabular-nums; }
.fif-count.is-busy { opacity: 0.6; }

.fif-masks { flex-wrap: wrap; gap: 4px; padding-left: 22px; }
.fif-chip {
  display: inline-flex;
  align-items: stretch;
  height: 20px;
  border: 1px solid var(--divider);
  border-radius: 4px;
  overflow: hidden;
  background: #35393a;
  color: var(--fg);
  font: 12px var(--ui-font);
}
.fif-chip-name { display: flex; align-items: center; padding: 0 7px; border: 0; background: transparent; color: inherit; white-space: nowrap; font: 12px 'JetBrains Mono', Menlo, monospace; cursor: default; }
.fif-chip-name:hover { background: #454a4b; }
.fif-chip.is-off { color: var(--muted); border-style: dashed; }
.fif-chip.is-off .fif-chip-name { text-decoration: line-through; }
.fif-chip-close {
  display: flex;
  align-items: center;
  padding: 0 6px;
  border: 0;
  border-left: 1px solid var(--divider);
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  line-height: 1;
  cursor: default;
}
.fif-chip-close:hover { background: #6b3a39; color: #ffd7d6; }
.fif-mask {
  flex: 1;
  min-width: 160px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--fg);
  font: 12px var(--ui-font);
  cursor: text;
}
.fif-mask::placeholder { color: var(--muted); }

.fif-body { display: flex; flex: 1; min-height: 0; }
.fif-list { width: 46%; flex: none; overflow: auto; border-right: 1px solid var(--divider); padding-bottom: 4px; }
.fif-section {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 6px 10px 2px;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
}
.fif-section-path { overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.fif-section-count { flex: none; }
.fif-row-hit { display: flex; align-items: baseline; gap: 8px; padding: 2px 10px 2px 18px; white-space: nowrap; overflow: hidden; }
.fif-row-hit.is-current { background: var(--treesel); }
.fif-line { flex: none; min-width: 3ch; text-align: right; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.fif-text { overflow: hidden; text-overflow: ellipsis; font-family: 'JetBrains Mono', Menlo, monospace; font-size: 12px; }
.fif-text b { color: var(--accent); font-weight: 700; }
.fif-row-hit.is-current .fif-text b { color: #ffe9bd; }
.fif-preview { flex: 1; min-width: 0; overflow: auto; background: var(--bg); }
.fif-empty { padding: 12px; color: var(--muted); }
.fif-note { padding: 8px 12px; color: var(--accent); font-size: 12px; }
`;
