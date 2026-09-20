/**
 * The changes panel's styling is its own, the plugin's.
 *
 * The colour of a file's name here means the same as in the tree and is taken from the
 * same theme variables: blue "changed", green "new", red "conflict". A second
 * dictionary of colours would mean that one and the same file looks different in the
 * tree and in the panel.
 */
export const STYLE = `
.chg {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font: 12px/1.5 var(--ui-font);
}

.chg-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--divider);
}
.chg-all { display: flex; align-items: center; gap: 6px; flex: 1; color: var(--muted); cursor: default; }
.chg-refresh {
  display: flex;
  flex: none;
  padding: 2px;
  border: 0;
  border-radius: 3px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: default;
}
.chg-refresh:hover { background: var(--control-bg-hover); color: var(--fg); }
.chg-shelf-buttons { flex: none; display: flex; justify-content: flex-end; gap: 6px; padding: 4px 8px 6px; }
.chg-shelf-file-row { display: flex; align-items: center; gap: 6px; padding-left: 22px; }
.chg-group .chg-empty { padding-left: 22px; }

.chg-list { flex: 1; min-height: 0; overflow: auto; padding: 2px 0; position: relative; }

.chg-find { position: sticky; top: 0; height: 0; z-index: 2; }
.chg-find-box {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 8px;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
}
.chg-find-box.is-on { background: var(--panel-bg); border-color: var(--divider); }
.chg-find-box.is-missing { border-color: var(--error); }
.chg-find-icon { color: var(--muted); font-size: 11px; }
.chg-find-box:not(.is-on) .chg-find-icon { display: none; }
.chg-find-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--fg);
  font: 12px/1.6 var(--ui-font);
}
.chg-find-box:not(.is-on) .chg-find-input { height: 0; padding: 0; }
.chg-hit { background: #4b6a2f; color: inherit; border-radius: 2px; }

.chg-group-head { display: flex; align-items: center; gap: 6px; padding: 2px 8px; }
.chg-group-head:hover { background: var(--control-bg); }
.chg-group-name {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
  text-align: left;
  cursor: default;
}
.chg-group-chevron { display: flex; flex: none; transform: rotate(90deg); transition: transform 90ms linear; }
.chg-group-head.is-folded .chg-group-chevron { transform: rotate(0deg); }
.chg-group-title { overflow: hidden; text-overflow: ellipsis; }
.chg-group-count { flex: none; }

.chg-group.is-drop { background: #40566b; outline: 1px dashed #7ba7d0; outline-offset: -1px; }

.chg-row.is-picked { background: #3c4f63; }
.chg-row.is-picked.is-current { background: var(--treesel); }
.chg-empty { padding: 8px; color: var(--muted); }

.chg-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px 1px 22px;
  white-space: nowrap;
  overflow: hidden;
}
.chg-row:hover { background: var(--control-bg); }
.chg-row.is-shown { background: var(--treesel); }
.chg-icon { display: flex; flex: none; }
.chg-icon svg { display: block; }
.chg-open {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
}
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
.chg-moved { flex: none; color: var(--muted); }
.chg-folder { color: var(--muted); overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }

.chg-row.is-modified .chg-name { color: var(--git-modified); }
.chg-row.is-added .chg-name,
.chg-row.is-untracked .chg-name { color: var(--git-added); }
.chg-row.is-conflict .chg-name { color: var(--git-conflict); }
.chg-row.is-deleted .chg-name { color: var(--muted); text-decoration: line-through; }

.chg-commit {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--divider);
  padding: 6px 8px;
}
.chg-message {
  flex: 1;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  resize: none;
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
.chg-note { margin-top: 4px; color: var(--accent); white-space: pre-wrap; }

.chg-buttons { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.chg-who { display: flex; gap: 6px; margin-top: 6px; }
.chg-who-field {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 2px 6px;
  border: 1px solid var(--divider);
  border-radius: 3px;
  background: var(--bg);
  color: var(--fg);
  font: 11px/1.5 var(--ui-font);
}
.chg-who-field:focus { border-color: var(--treesel); }
.chg-who-field.is-missing { border-color: var(--error); }
.chg-who-field::placeholder { color: var(--muted); }
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

.chg-shelf {
  flex: none;
  display: flex;
  flex-direction: column;
  max-height: 30%;
  border-top: 1px solid var(--divider);
}
.chg-shelf-list { flex: 1; min-height: 0; overflow: auto; padding-bottom: 4px; }
.chg-section {
  padding: 5px 8px 2px;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.chg-shelf-row { display: flex; align-items: center; gap: 6px; padding: 1px 8px; white-space: nowrap; }
.chg-shelf-row:hover { background: var(--control-bg); }
.chg-shelf-name {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
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
.chg-shelf-chevron { display: flex; flex: none; color: var(--muted); transition: transform 90ms linear; }
.chg-shelf-row.is-open .chg-shelf-chevron { transform: rotate(90deg); }
.chg-shelf-file {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 1px 8px 1px 22px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: default;
}
.chg-shelf-file:hover { background: var(--control-bg); color: var(--fg); }
.chg-shelf-file.is-shown { background: var(--treesel); color: var(--fg); }
.chg-shelf-file-name { overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.chg-shelf-do { display: flex; flex: none; gap: 4px; visibility: hidden; }
.chg-shelf-row:hover .chg-shelf-do { visibility: visible; }
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

.dif {
  height: 100%;
  overflow: auto;
  font: 12px/1.5 var(--font);
  white-space: pre;
}
.dif.is-split { display: flex; overflow: hidden; }
.dif-side { flex: 1; min-width: 0; overflow: auto; }
.dif-side + .dif-side { border-left: 1px solid var(--divider); }
.dif-row.is-none { background: var(--panel-bg); }
.dif-note { padding: 10px; color: var(--muted); font: 12px/1.5 var(--ui-font); }
.dif-note.is-bad { color: var(--git-conflict); white-space: pre-wrap; }
.dif-row { display: flex; align-items: flex-start; min-height: 18px; }
.dif-row.is-ins { background: var(--diff-added-bg); }
.dif-row.is-del { background: var(--diff-removed-bg); }
.dif-no {
  flex: none;
  width: 44px;
  padding-right: 8px;
  text-align: right;
  color: var(--muted);
  user-select: none;
  font-variant-numeric: tabular-nums;
}
.dif-sign { flex: none; width: 14px; text-align: center; color: var(--muted); user-select: none; }
.dif-text { flex: 1; min-width: 0; padding-right: 10px; }
.dif-row { position: relative; }
.dif-revert {
  position: absolute;
  top: 1px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: var(--control-bg);
  color: var(--fg-dim);
  opacity: 0.75;
  cursor: pointer;
}
.dif-revert:hover { opacity: 1; color: var(--fg); background: var(--control-bg-hover, var(--control-bg)); }

.dif-fold {
  display: block;
  width: 100%;
  padding: 2px 10px;
  border: 0;
  border-top: 1px solid var(--divider);
  border-bottom: 1px solid var(--divider);
  background: var(--panel-bg);
  color: var(--muted);
  font: 11px/1.6 var(--ui-font);
  text-align: left;
  cursor: default;
}
.dif-fold:hover { background: var(--control-bg); color: var(--fg); }
`;
