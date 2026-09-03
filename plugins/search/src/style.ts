export const STYLE = `

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

.se {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.se-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.se-icon { color: var(--muted); font-size: 15px; }
.se-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--fg);
  font: 15px/1.3 var(--font);
  cursor: text;
}
.se-input::placeholder { color: var(--muted); }
.se-count { color: var(--muted); flex: none; }

.se-body { display: flex; flex: 1; min-height: 0; }

.se-list {
  width: 46%;
  flex: none;
  overflow: auto;
  border-right: 1px solid var(--divider);
  padding-bottom: 4px;
}

.se-section {
  padding: 6px 10px 2px;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.se-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 10px;
  white-space: nowrap;
  overflow: hidden;
}
.se-row.is-current { background: var(--treesel); }
.se-label { flex: none; overflow: hidden; text-overflow: ellipsis; }
.se-label b { color: var(--accent); font-weight: 700; }
.se-row.is-current .se-label b { color: #ffe9bd; }
.se-detail {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
}
.se-row.is-current .se-detail { color: #c6d3dd; }

.se-preview { flex: 1; min-width: 0; overflow: auto; background: var(--bg); }
.se-empty { padding: 12px; color: var(--muted); }

.code-view { height: 100%; }
.code-view .cm-editor { height: 100%; }
.cm-hit-line { background: var(--curline); }

`;
