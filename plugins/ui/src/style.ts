export const STYLE = `

.resizer {
  flex: none;
  width: 5px;
  margin: 0 -2px;
  z-index: 2;
  cursor: col-resize;
  background: transparent;
  transition: background-color 120ms linear;
}
.resizer:hover, .resizer:active { background: var(--treesel); }
.pick { display: flex; flex-direction: column; }
.pick-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0;
  border-top: 1px solid var(--divider);
}
.pick-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 10px;
  white-space: nowrap;
  font: 13px/1.4 var(--ui-font);
}
.pick-row:not(.is-current):hover { background: #45494a; }
.pick-row.is-current { background: var(--treesel); color: #dbe6ef; }
.pick-name { flex: none; overflow: hidden; text-overflow: ellipsis; }
.pick-name b { color: var(--accent); font-weight: 700; }
.pick-row.is-current .pick-name b { color: #ffe9bd; }
.pick-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--muted);
  font: 11px var(--font);
}
.pick-row.is-current .pick-detail { color: #c6d3dd; }
.choice { padding: 10px 12px; gap: 8px; }
.choice-title { font-size: 13px; color: var(--fg); flex: none; }
.choice-note { color: var(--muted); font-size: 11px; line-height: 1.45; flex: none; }
.choice-list { flex: 1; min-height: 0; overflow: auto; margin-top: 4px; }
.choice-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 6px;
  cursor: pointer;
}
.choice-row:hover { background: var(--control-bg); }
.choice-row.is-current { background: var(--treesel); }
.choice-name { color: var(--fg); font-size: 12px; flex: none; }
.choice-path { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choice-mark { margin-left: auto; color: var(--accent); font-size: 11px; flex: none; }
.choice-empty { padding: 4px 6px; color: var(--muted); font-style: italic; }
.choice-custom { display: flex; gap: 6px; flex: none; }
.choice-input {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  background: var(--bg);
  border: 1px solid var(--divider);
  border-radius: 4px;
  color: var(--fg);
  font-family: var(--mono, monospace);
  font-size: 12px;
}
.choice-input:focus { outline: none; border-color: var(--treesel); }
.choice-apply {
  flex: none;
  padding: 4px 10px;
  background: var(--control-bg);
  border: none;
  border-radius: 4px;
  color: var(--fg);
  cursor: pointer;
}
.choice-apply:hover { background: var(--control-bg-hover); }
.choice-reset { flex: none; color: var(--muted); font-size: 11px; cursor: pointer; }
.choice-reset:hover { color: var(--fg); text-decoration: underline; }
.pick-head {
  padding: 6px 8px 2px;
  color: var(--muted);
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0.02em;
  border-bottom: 1px solid var(--divider);
  margin-bottom: 2px;
  cursor: default;
  user-select: none;
}
.pick-head:first-child { padding-top: 2px; }
.pick-list.is-sectioned .pick-row { padding-left: 16px; }
.pick-list.is-sectioned .pick-name {
  flex: none;
  min-width: 16ch;
}
.tip {
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  max-width: min(42ch, calc(100vw - 24px));
  padding: 5px 9px;
  background: #1f2224;
  border: 1px solid var(--divider);
  border-radius: 5px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  color: var(--fg);
  font: 12px var(--ui-font);
  pointer-events: none;
}
.tip-title { color: var(--fg); }
.tip-key {
  flex: none;
  white-space: nowrap;
  padding: 1px 5px;
  background: var(--control-bg);
  border-radius: 3px;
  color: var(--accent);
  font-family: var(--mono, monospace);
  font-size: 11px;
}

.se-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 8vh;
  z-index: 50;
}
.se-backdrop.is-clear { background: transparent; }
.se-backdrop.is-full { padding-top: 0; align-items: stretch; }
.popup.is-anchored { position: fixed; }
.popup:focus, .popup:focus-visible { outline: none; }
.popup {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel-bg);
  border: 1px solid var(--divider);
  border-radius: 6px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.popup-exit {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 6px;
}
.popup-esc {
  color: var(--muted);
  font: 10px var(--ui-font);
  letter-spacing: 0.04em;
  padding: 1px 4px;
  border: 1px solid var(--divider);
  border-radius: 3px;
  cursor: default;
  user-select: none;
}
.popup > .popup-exit + * { padding-right: 62px; }
.popup-grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  z-index: 3;
  cursor: nwse-resize;
  background:
    linear-gradient(135deg, transparent 52%, var(--muted) 52%, var(--muted) 60%, transparent 60%),
    linear-gradient(135deg, transparent 72%, var(--muted) 72%, var(--muted) 80%, transparent 80%);
  opacity: 0.55;
}
.popup-grip:hover { opacity: 1; }

.branch-action {
  text-align: left;
  padding: 3px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--fg);
  font: 13px/1.5 var(--ui-font);
  white-space: nowrap;
}
.branch-action:hover,
.branch-action.is-current { background: var(--treesel); color: #dbe6ef; }
.branch-action.is-danger { color: #e0a0a0; }
.branch-action.is-danger:hover,
.branch-action.is-danger.is-current { background: #6b3a39; color: #ffd7d6; }

.branch-prompt { display: flex; flex-direction: column; gap: 6px; }

.branches-foot {
  display: flex;
  gap: 6px;
  padding: 7px 12px;
  padding-right: 22px;
  border-top: 1px solid var(--divider);
  flex: none;
}
.branch-menu:focus, .branch-menu:focus-visible { outline: none; }
.branch-menu {
  position: fixed;
  z-index: 90;
  display: flex;
  flex-direction: column;
  min-width: 190px;
  padding: 2px 0;
  border: 1px solid var(--divider);
  background: var(--panel-bg);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
}

.branches-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.branches-title { font-size: 14px; }
.branches-meta { color: var(--muted); font-size: 12px; }
.branches-filter { flex: none; padding: 6px 8px; }
.branches-filter .field { width: 100%; }

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
`;
