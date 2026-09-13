export const STYLE = `
.settings-top { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--divider); }
.settings-title { flex: none; color: var(--fg); font: 600 14px var(--ui-font); }
.settings-search { position: relative; display: flex; align-items: center; flex: none; }
.settings-filter { box-sizing: border-box; width: 240px; padding-right: 24px; }
.settings-filter-x {
  position: absolute; right: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; padding: 0; border: none; border-radius: 3px;
  background: var(--control-bg); color: var(--fg); font: 12px var(--ui-font); cursor: pointer;
}
.settings-filter-x:hover { background: #6b3a39; color: #ffd7d6; }
.settings-list {
  --settings-title: 168px;      
  --settings-value: 300px;      
  --settings-input: 132px;      
  --settings-input-open: 360px; 
  flex: 1; overflow: auto; padding: 6px 0 12px;
}

.settings-group { border-bottom: 1px solid var(--divider); }
.settings-group-head {
  position: sticky; top: 0; z-index: 1;
  display: grid; grid-template-columns: 12px var(--settings-title) minmax(0, max-content) minmax(0, 1fr);
  align-items: center; gap: 8px; width: 100%;
  padding: 10px 14px; border: none; background: var(--panel-bg);
  color: var(--fg); text-align: left; cursor: pointer;
}
.settings-group-head:hover { background: var(--control-bg); }
.settings-group-title { overflow: hidden; font: 600 13px var(--ui-font); text-overflow: ellipsis; white-space: nowrap; }
.settings-group-count { justify-self: end; display: flex; gap: 10px; color: var(--muted); font: 11px var(--ui-font); }
.settings-group-changed { color: var(--accent); }
.settings-group-project { color: #8fc891; }

.settings-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) minmax(0, min(var(--settings-value), 40%)) max-content;
  align-items: center; gap: 0 14px;
  margin: 0 14px 10px 22px; padding-left: 12px; border-left: 1px solid var(--divider);
}
.settings-row {
  display: grid; grid-column: 1 / -1; grid-template-columns: subgrid;
  align-items: center; min-height: 32px; padding: 3px 0; border-radius: 4px;
}
.settings-row:hover { background: rgba(255, 255, 255, 0.03); }
.settings-label { min-width: 0; color: var(--fg); font: 13px var(--ui-font); }
.settings-row.is-set .settings-label { color: var(--accent); }

.settings-value { position: relative; display: flex; align-items: center; min-height: 26px; }
.settings-value .field { box-sizing: border-box; width: var(--settings-input); height: 26px; }
.settings-text {
  position: absolute; left: 0; top: 50%; margin-top: -13px;
  overflow: hidden; text-overflow: ellipsis;
  transition: width 120ms ease, left 120ms ease;
}
.settings-text:focus {
  z-index: 3; left: calc(var(--settings-input) - var(--settings-input-open));
  width: var(--settings-input-open); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}

.settings-chip {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  max-width: 100%; padding: 1px 7px; border-radius: 9px;
  background: var(--control-bg); color: var(--muted);
  font: 11px var(--mono, monospace); white-space: nowrap;
}
.settings-chip.is-path { justify-self: start; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
.settings-chip.is-owner { justify-self: start; overflow: hidden; text-overflow: ellipsis; }
.settings-chip.is-value { color: var(--fg); padding-right: 3px; }
.settings-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.settings-chip-x, .settings-chip-add {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; padding: 0; border: none; border-radius: 50%;
  background: transparent; color: var(--muted); font: 12px var(--ui-font); cursor: pointer;
}
.settings-chip-x:hover { background: #6b3a39; color: #ffd7d6; }
.settings-chip-new { display: inline-flex; align-items: center; gap: 2px; padding: 1px 3px 1px 7px; border: 1px dashed var(--divider); border-radius: 9px; }
.settings-chip-input { width: 66px; border: none; outline: none; background: transparent; color: var(--fg); font: 11px var(--mono, monospace); }
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

.settings-tail { display: flex; justify-content: flex-end; }
.settings-scope {
  display: inline-flex; align-items: center; flex: none;
  padding: 1px; border-radius: 5px; background: var(--bg);
}
.settings-stop {
  padding: 2px 7px; border: none; border-radius: 4px;
  background: transparent; color: var(--muted);
  font: 11px var(--ui-font); cursor: pointer; white-space: nowrap;
}
.settings-stop:hover:not(:disabled) { color: var(--fg); }
.settings-stop.is-on { background: var(--control-bg); color: var(--fg); }
.settings-stop.is-on:last-child { background: #3a5a3c; color: #d7f0d8; }
.settings-stop:disabled { opacity: 0.35; cursor: default; }
.settings-hit { background: #6b5d2a; border-radius: 2px; color: #f2ecd8; font-weight: inherit; }

.settings-empty { padding: 24px; color: var(--muted); text-align: center; }
`;
