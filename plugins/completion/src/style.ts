export const STYLE = `
.cm-tooltip:has(> .cmp-host) { background: transparent; border: none; }
.cmp-host { margin-left: -28px; }
.cmp { display: flex; align-items: flex-start; gap: 4px; font: 12px var(--font); color: var(--fg); }
.cmp-main {
  min-width: 280px;
  max-width: 560px;
  background: #3b3e40;
  border: 1px solid var(--divider);
  border-radius: 3px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.cmp-list { max-height: 240px; overflow-y: auto; }
.cmp-row { display: flex; align-items: center; gap: 6px; height: 20px; padding: 0 6px; white-space: nowrap; cursor: default; }
.cmp-row.is-selected { background: var(--treesel); color: #fff; }
.cmp-row.is-deprecated .cmp-label { text-decoration: line-through; }
.cmp-kind {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 3px;
  background: var(--control-bg);
  font: 10px var(--ui-font);
  color: var(--muted);
}
.cmp-kind-method, .cmp-kind-function, .cmp-kind-constructor { color: #ffc66d; }
.cmp-kind-field, .cmp-kind-property, .cmp-kind-member, .cmp-kind-constant { color: #9876aa; }
.cmp-kind-variable { color: #a9b7c6; }
.cmp-kind-class, .cmp-kind-interface, .cmp-kind-enum, .cmp-kind-type { color: #e8d9a0; }
.cmp-kind-keyword { color: #cc7832; }
.cmp-kind-module, .cmp-kind-file, .cmp-kind-folder { color: #6897bb; }
.cmp-kind-postfix, .cmp-kind-snippet { color: #6a8759; }
.cmp-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cmp-label b { background: #6b5d2a; border-radius: 2px; color: #f2ecd8; font-weight: inherit; }
.cmp-detail { flex: none; max-width: 50%; overflow: hidden; text-overflow: ellipsis; padding-left: 18px; color: var(--muted); }
.cmp-row.is-selected .cmp-detail { color: #c9d4de; }
.cmp-foot { padding: 2px 6px; border-top: 1px solid var(--divider); color: var(--muted); font: 11px var(--ui-font); }
.cmp-docs {
  max-width: 440px;
  max-height: 260px;
  overflow: auto;
  padding: 6px 8px;
  background: #3b3e40;
  border: 1px solid var(--divider);
  border-radius: 3px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  white-space: pre-wrap;
  font: 12px/1.4 var(--font);
  cursor: text;
  user-select: text;
}
.cmp-docs-text { font-family: var(--ui-font); }
.cmp-docs-code + .cmp-docs-text { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--divider); }
`;
