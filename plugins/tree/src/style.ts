export const STYLE = `
.tree-find { position: sticky; top: 0; height: 0; z-index: 3; }
.tree-find-box {
  position: absolute;
  top: 2px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  background: var(--bg);
  border: 1px solid var(--treesel);
  border-radius: 4px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  font: 12px var(--ui-font);
}
.tree-find-box.is-on {
  width: auto;
  height: auto;
  padding: 3px 8px;
  overflow: visible;
  opacity: 1;
  pointer-events: auto;
}
.tree-find-box.is-missing { border-color: var(--error); }
.tree-find-box.is-missing .tree-find-input { color: var(--error); }
.tree-find-icon { color: var(--muted); }
.tree-find-input {
  width: 14ch;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--fg);
  font: inherit;
  outline: none;
  cursor: text;
}
.tree-name b {
  background: #6b5d2a;
  border-radius: 2px;
  color: #f2ecd8;
  font-weight: inherit;
}

.tree {
  padding: 3px 0;
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  font: 13px/1.35 var(--ui-font);
}
.tree:focus, .tree:focus-visible { outline: none; }
.tree-empty {
  padding: 12px;
  color: var(--muted);
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 21px;
  padding-right: 8px;
  white-space: nowrap;
}
.tree-row:hover { background: #45494a; }
.tree-row.is-current { background: var(--treesel); }
.tree-row.is-excluded { background: rgba(190, 120, 40, 0.09); }
.tree-row.is-excluded:hover { background: rgba(190, 120, 40, 0.16); }
.tree-row.is-excluded.is-current { background: var(--treesel); }

.tree-icon {
  flex: none;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
}

.tree-name { flex: none; }
.tree-name.is-root { font-weight: 700; }

.tree-name.git-modified { color: var(--git-modified); }
.tree-name.git-added { color: var(--git-added); }
.tree-name.git-conflict { color: var(--git-conflict); }

.tree-row.is-excluded .tree-name { color: var(--noscan); }

.tree-note {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: 2px;
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-menu { min-width: 200px; }

.tree-row.is-picked { background: #3c4f63; }
.tree-row.is-picked.is-current { background: var(--treesel); }
.tree-row.is-focused { outline: 1px solid var(--treesel); outline-offset: -1px; }

.tree-row.is-drop { background: #40566b; outline: 1px dashed #7ba7d0; outline-offset: -1px; }

.column-tree { background: var(--panel-bg); }
.tree-name.is-broken {
  text-decoration: underline wavy var(--error);
  text-decoration-skip-ink: none;
  text-underline-offset: 1px;
}
`;
