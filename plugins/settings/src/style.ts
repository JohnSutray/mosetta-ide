export const STYLE = `
.settings-top { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--divider); }
.settings-title { flex: none; color: var(--fg); font: 600 14px var(--ui-font); }
.settings-filter { flex: 1; }
.settings-list { flex: 1; overflow: auto; padding: 6px 0 12px; }

.settings-group { border-bottom: 1px solid var(--divider); }
.settings-group-head {
  position: sticky; top: 0; z-index: 1;
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 10px 14px; border: none; background: var(--panel-bg);
  color: var(--fg); text-align: left; cursor: pointer;
}
.settings-group-head:hover { background: var(--control-bg); }
.settings-group-title { font: 600 13px var(--ui-font); }
.settings-group-count { margin-left: auto; display: flex; gap: 10px; color: var(--muted); font: 11px var(--ui-font); }
.settings-group-changed { color: var(--accent); }
.settings-rows { margin: 0 14px 10px 22px; padding-left: 12px; border-left: 1px solid var(--divider); }

.settings-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 340px) 28px;
  align-items: center; gap: 14px; padding: 7px 8px; border-radius: 4px;
}
.settings-row:hover { background: rgba(255, 255, 255, 0.03); }
.settings-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.settings-label { min-width: 0; color: var(--fg); font: 13px var(--ui-font); }
.settings-row.is-set .settings-label { color: var(--accent); }
.settings-value .field { box-sizing: border-box; width: 100%; }
.settings-number { max-width: 120px; }

.settings-chip {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  max-width: 100%; padding: 1px 7px; border-radius: 9px;
  background: var(--control-bg); color: var(--muted);
  font: 11px var(--mono, monospace); white-space: nowrap;
}
.settings-chip.is-path { max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
.settings-chip.is-value { color: var(--fg); padding-right: 3px; }
.settings-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.settings-chip-x, .settings-chip-add {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; padding: 0; border: none; border-radius: 50%;
  background: transparent; color: var(--muted); font: 12px var(--ui-font); cursor: pointer;
}
.settings-chip-x:hover { background: #6b3a39; color: #ffd7d6; }
.settings-chip-new { display: inline-flex; align-items: center; gap: 2px; padding: 1px 3px 1px 7px; border: 1px dashed var(--divider); border-radius: 9px; }
.settings-chip-input { width: 90px; border: none; outline: none; background: transparent; color: var(--fg); font: 11px var(--mono, monospace); }
.settings-chip-add { background: var(--control-bg); color: var(--fg); }
.settings-chip-add:hover { background: var(--control-bg-hover); }

.settings-switch {
  position: relative; width: 30px; height: 16px; padding: 0; flex: none;
  border: none; border-radius: 8px; background: var(--control-bg); cursor: pointer;
  transition: background 120ms;
}
.settings-switch.is-on { background: var(--treesel); }
.settings-knob {
  position: absolute; top: 2px; left: 2px; width: 12px; height: 12px;
  border-radius: 50%; background: #cfd4d6; transition: transform 120ms;
}
.settings-switch.is-on .settings-knob { transform: translateX(14px); }

.settings-object { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.settings-object code { overflow: hidden; color: var(--muted); font: 11px var(--mono, monospace); text-overflow: ellipsis; white-space: nowrap; }
.settings-note { color: var(--muted); font: 11px var(--ui-font); }

.settings-tail { display: flex; justify-content: center; }
.settings-reset {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border: none; border-radius: 4px;
  background: var(--control-bg); color: var(--fg); cursor: pointer;
}
.settings-reset:hover { background: #6b3a39; color: #ffd7d6; }
.settings-empty { padding: 24px; color: var(--muted); text-align: center; }
`;
