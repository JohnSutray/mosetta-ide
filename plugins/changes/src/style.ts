export const STYLE = `
.chg {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font: 12px/1.5 var(--ui-font);
}

.chg-head { flex: none; padding: 4px 8px; border-bottom: 1px solid var(--divider); }
.chg-all { display: flex; align-items: center; gap: 6px; color: var(--muted); cursor: default; }

.chg-list { flex: 1; min-height: 0; overflow: auto; padding: 2px 0; }
.chg-empty { padding: 8px; color: var(--muted); }

.chg-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  white-space: nowrap;
  overflow: hidden;
}
.chg-row:hover { background: var(--control-bg); }
.chg-icon { display: flex; flex: none; }
.chg-icon svg { display: block; }
.chg-name {
  flex: none;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
}
.chg-folder { color: var(--muted); overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }

.chg-row.is-modified .chg-name { color: var(--git-modified); }
.chg-row.is-added .chg-name,
.chg-row.is-untracked .chg-name { color: var(--git-added); }
.chg-row.is-conflict .chg-name { color: var(--git-conflict); }
.chg-row.is-deleted .chg-name { color: var(--muted); text-decoration: line-through; }

.chg-commit { flex: none; border-top: 1px solid var(--divider); padding: 6px 8px; }
.chg-message {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  background: var(--bg);
  border: 1px solid var(--divider);
  border-radius: 3px;
  color: var(--fg);
  font: 12px/1.45 var(--font);
  padding: 4px 6px;
  cursor: text;
}
.chg-message:focus { border-color: var(--treesel); }
.chg-message::placeholder { color: var(--muted); }
.chg-error { margin-top: 4px; color: var(--git-conflict); white-space: pre-wrap; }

.chg-buttons { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.chg-amend { display: flex; align-items: center; gap: 4px; margin-right: auto; color: var(--muted); cursor: default; }
.chg-do, .chg-shelve {
  flex: none;
  padding: 2px 10px;
  border: none;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--fg);
  font: inherit;
  cursor: default;
}
.chg-do { background: var(--treesel); color: #dbe6ef; }
.chg-do:disabled, .chg-shelve:disabled { opacity: 0.45; }
.chg-do:not(:disabled):hover { filter: brightness(1.12); }
.chg-shelve:not(:disabled):hover { background: #45494a; }

.chg-shelf { flex: none; max-height: 30%; overflow: auto; border-top: 1px solid var(--divider); }
.chg-section {
  padding: 5px 8px 2px;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.chg-shelf-row { display: flex; align-items: center; gap: 6px; padding: 1px 8px; white-space: nowrap; }
.chg-shelf-row:hover { background: var(--control-bg); }
.chg-shelf-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.chg-shelf-when { flex: none; color: var(--muted); font-variant-numeric: tabular-nums; }
.chg-shelf-take, .chg-shelf-drop {
  flex: none;
  padding: 0 6px;
  border: 0;
  border-radius: 3px;
  background: var(--control-bg);
  color: var(--fg);
  font: inherit;
  cursor: default;
}
.chg-shelf-take:hover { background: #45494a; }
.chg-shelf-drop:hover { background: #6b3a39; color: #ffd7d6; }
`;
