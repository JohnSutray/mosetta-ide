export const STYLE = `

.tree {
  padding: 3px 0;
  width: max-content;
  min-width: 100%;
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

.chevron {
  flex: none;
  width: 12px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b9296;
  transition: transform 90ms linear;
}
.chevron.is-open { transform: rotate(90deg); }
.chevron.is-hidden { visibility: hidden; }

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

.prompt { display: flex; flex-direction: column; }

.prompt-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}
.prompt-text {
  color: var(--muted);
  font: 12px/1.5 var(--ui-font);
  white-space: pre-wrap;
  overflow: auto;
  flex: 0 1 auto;
  min-height: 0;
}
.prompt .field { flex: none; }
.prompt-error { color: var(--error); font: 12px/1.4 var(--ui-font); flex: none; }
.prompt-foot { flex: none; margin-top: auto; display: flex; justify-content: flex-end; gap: 6px; }

.tree-menu { min-width: 200px; }

.tree-row.is-picked { background: #3c4f63; }
.tree-row.is-picked.is-current { background: var(--treesel); }
.tree-row.is-focused { outline: 1px solid var(--treesel); outline-offset: -1px; }

.tree-row.is-drop { background: #40566b; outline: 1px dashed #7ba7d0; outline-offset: -1px; }

.prompt-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.prompt-title { font-size: 14px; }

.column-tree { background: var(--panel-bg); }
.tree-name.is-broken {
  text-decoration: underline wavy var(--error);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}
`;
