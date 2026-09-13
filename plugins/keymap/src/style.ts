export const STYLE = `
.keymap-editor { display: flex; flex-direction: column; gap: 10px; padding: 4px 0 10px; }
.keymap-top { display: flex; align-items: center; gap: 8px; }
.keymap-filter { box-sizing: border-box; width: 240px; }
.keymap-rows { display: flex; flex-direction: column; }

.keymap-row {
  display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content max-content;
  align-items: center; gap: 10px; padding: 3px 0; border-radius: 4px;
}
.keymap-row:hover { background: rgba(255, 255, 255, 0.03); }
.keymap-row.is-mine .keymap-command { color: var(--accent); }
.keymap-chord { padding: 0; border: none; background: transparent; cursor: pointer; }
.keymap-command { min-width: 0; color: var(--fg); font: 13px var(--ui-font); }
.keymap-where { display: flex; gap: 4px; }
.keymap-actions { display: flex; gap: 4px; }
.keymap-act {
  padding: 1px 7px; border: none; border-radius: 9px;
  background: var(--control-bg); color: var(--muted); font: 11px var(--ui-font); cursor: pointer;
}
.keymap-act:hover { background: var(--control-bg-hover); color: var(--fg); }
.keymap-chip {
  display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 9px;
  background: var(--control-bg); color: var(--muted); font: 11px var(--mono, monospace); white-space: nowrap;
}
.keymap-chip.is-mine { color: var(--accent); }
.keymap-chip.is-alien { color: var(--noscan); }
.keymap-kbd {
  display: inline-flex; align-items: center; padding: 1px 6px;
  border: 1px solid var(--divider); border-bottom-width: 2px; border-radius: 4px;
  background: var(--control-bg); color: var(--fg); font: 11px var(--mono, monospace); white-space: nowrap;
}
.keymap-kbd.is-big { font-size: 13px; padding: 3px 10px; }
.keymap-empty { padding: 16px; color: var(--muted); text-align: center; }

.keymap-catch {
  grid-column: 1 / -1;
  display: flex; flex-direction: column; gap: 8px;
  margin: 6px 0; padding: 10px; border: 1px solid var(--divider); border-radius: 6px;
  background: var(--bg);
}
.keymap-catch-title { color: var(--fg); font: 600 12px var(--ui-font); }
.keymap-catch-row { display: flex; align-items: center; gap: 10px; }
.keymap-trap {
  display: flex; align-items: center; justify-content: center;
  min-width: 150px; min-height: 34px; padding: 4px 10px;
  border: 1px dashed var(--divider); border-radius: 6px;
  color: var(--muted); font: 11px var(--ui-font); cursor: pointer;
}
.keymap-trap:focus { outline: none; border-color: var(--treesel); border-style: solid; color: var(--fg); }
.keymap-command-input { box-sizing: border-box; width: 260px; }

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

.keymap-picks { display: flex; flex-direction: column; max-height: 180px; overflow: auto; }
.keymap-pick {
  display: grid; grid-template-columns: max-content max-content minmax(0, 1fr);
  align-items: center; gap: 8px; padding: 3px 6px; border: none; border-radius: 4px;
  background: transparent; color: var(--fg); font: 12px var(--ui-font); text-align: left; cursor: pointer;
}
.keymap-pick:hover, .keymap-pick.is-on { background: var(--control-bg); }
.keymap-pick-name { white-space: nowrap; }
.keymap-pick-about { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
`;
