/** The layout editor: the section's own screen in the settings window. */
export const STYLE = `
.keymap-editor { --keymap-inset: 14px; display: flex; flex-direction: column; gap: 10px; padding: 4px 0 10px; }
.keymap-top { display: flex; align-items: center; gap: 8px; padding: 0 var(--keymap-inset); }
.keymap-filter { box-sizing: border-box; width: 240px; }
.keymap-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content max-content max-content max-content;
  align-items: center; gap: 0 10px;
  padding: 0 var(--keymap-inset);
}

.keymap-row {
  display: grid; grid-column: 1 / -1; grid-template-columns: subgrid;
  align-items: center; padding: 3px 0; border-radius: 4px;
  cursor: pointer;
}
.keymap-row:hover { background: rgba(255, 255, 255, 0.03); }
.keymap-row.is-head { cursor: default; color: var(--muted); font: 10px var(--ui-font); text-transform: uppercase; letter-spacing: .04em; }
.keymap-row.is-head:hover { background: none; }
.keymap-row.is-head .keymap-chord { padding-left: 16px; }
.keymap-row.is-mine .keymap-command { color: var(--accent); }
.keymap-chord { display: inline-flex; align-items: center; gap: 4px; }
.keymap-chord .chevron { color: var(--divider); }
.keymap-row:hover .keymap-chord .chevron, .keymap-chord .chevron.is-open { color: var(--muted); }
.keymap-command { min-width: 0; color: var(--fg); font: 13px var(--ui-font); }
.keymap-context, .keymap-where, .keymap-tags { display: flex; align-items: center; gap: 4px; }
.keymap-any { color: var(--muted); font: 11px var(--ui-font); opacity: .7; }
.keymap-actions { display: flex; gap: 2px; justify-content: flex-end; }
.keymap-act {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border: none; border-radius: 5px;
  background: transparent; color: var(--muted); cursor: pointer;
}
.keymap-act:hover { background: var(--control-bg); color: var(--fg); }
.keymap-act.is-danger:hover { background: rgba(255, 107, 104, 0.14); color: var(--error); }
.keymap-chip {
  display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 9px;
  background: var(--control-bg); color: var(--muted); font: 11px var(--mono, monospace); white-space: nowrap;
}
.keymap-chip.is-mine { color: var(--accent); }
.keymap-chip.is-where { gap: 3px; color: var(--noscan); }
.keymap-os { display: inline-flex; align-items: center; }
.keymap-kbd {
  display: inline-flex; align-items: center; padding: 1px 6px;
  border: 1px solid var(--divider); border-bottom-width: 2px; border-radius: 4px;
  background: var(--control-bg); color: var(--fg); font: 11px var(--mono, monospace); white-space: nowrap;
}
.keymap-kbd.is-big { font-size: 13px; padding: 3px 10px; }
.keymap-rows.is-gone { margin-bottom: 4px; }
.keymap-row.is-gone { cursor: default; }
.keymap-row.is-gone .keymap-command { color: var(--muted); text-decoration: line-through; }
.keymap-kbd.is-dead { color: var(--muted); text-decoration: line-through; }
.keymap-empty { padding: 16px; color: var(--muted); text-align: center; }

.keymap-catch {
  grid-column: 1 / -1;
  cursor: default;
  display: flex; flex-direction: column; gap: 8px;
  margin: 6px 0; padding: 10px; border: 1px solid var(--divider); border-radius: 6px;
  background: var(--bg);
}
.keymap-catch-title { color: var(--fg); font: 600 12px var(--ui-font); }
.keymap-catch-row { display: flex; align-items: center; gap: 10px; }
.keymap-trap-box { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: none; }
.keymap-trap {
  display: flex; align-items: center; justify-content: center;
  min-width: 150px; min-height: 34px; padding: 4px 10px;
  border: 1px dashed var(--divider); border-radius: 6px;
  color: var(--muted); font: 11px var(--ui-font); cursor: pointer;
}
.keymap-trap:focus { outline: none; border-color: var(--treesel); border-style: solid; color: var(--fg); }
.keymap-hint { color: var(--muted); font: 10px var(--ui-font); }
.keymap-hint.is-listening { color: var(--accent); }

.keymap-label { color: var(--muted); font: 11px var(--ui-font); }
.keymap-when { box-sizing: border-box; width: 190px; padding-right: 10px; }
.keymap-scopes { display: flex; flex-direction: column; gap: 3px; }
.keymap-scope-row { display: flex; align-items: center; gap: 3px; }
.keymap-scope-host { display: inline-flex; color: var(--muted); padding-right: 2px; }
.keymap-scope {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 22px; padding: 0; border: 1px solid var(--divider); border-radius: 4px;
  background: transparent; color: var(--muted); cursor: pointer;
}
.keymap-scope:hover { color: var(--fg); }
.keymap-scope.is-on { background: var(--treesel); border-color: var(--treesel); color: #e8f1ff; }

.keymap-board { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.keymap-board-row { display: flex; gap: 3px; }
.keymap-cap {
  display: flex; align-items: center; justify-content: center;
  flex: 1 1 0; min-width: 0; height: 18px; padding: 0 2px;
  border: 1px solid var(--divider); border-radius: 3px;
  background: var(--panel-bg); color: var(--muted);
  font: 9px var(--ui-font); overflow: hidden;
}
.keymap-cap.is-down { background: var(--treesel); border-color: var(--treesel); color: #e8f1ff; }

.keymap-combo { position: relative; flex: none; }
.keymap-command-input { box-sizing: border-box; width: 260px; }
.keymap-command-hint {
  height: 14px; padding: 1px 2px 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--muted); font: 11px var(--ui-font);
}
.keymap-picks {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 5;
  display: flex; flex-direction: column;
  min-width: 100%; width: max-content; max-width: 620px; max-height: 240px; overflow: auto;
  padding: 4px; border: 1px solid var(--divider); border-radius: 6px;
  background: var(--panel-bg); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}
.keymap-pick {
  display: grid; grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center; gap: 8px; padding: 3px 6px; border: none; border-radius: 4px;
  background: transparent; color: var(--fg); font: 12px var(--ui-font); text-align: left; cursor: pointer;
}
.keymap-pick:hover, .keymap-pick.is-on { background: var(--control-bg); }
.keymap-pick-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
