/**
 * The columns' styling.
 *
 * It left the core's stylesheet entirely, along with the layout itself. A plugin that
 * draws a panel has to be able to dress it — otherwise its CSS would have to be kept by
 * the core, which is exactly the leak that carrying the npm icon was.
 */
export const STYLE = `
.columns {
  display: flex;
  flex: 1;
  min-height: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--divider);
}
.panel:last-child { border-right: none; }
.panel.is-main { flex: 1; min-width: 0; }
.columns-rest { flex: 1; min-width: 0; }

.columns-middle {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
}
.columns-middle > .panel.is-main:last-child { border-right: none; }
.panel.is-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg);
  border-right: none;
  z-index: 3;
}
.panel.is-overlay:focus { outline: none; }

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 8px;
  flex: none;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--divider);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
}
.panel-title { overflow: hidden; text-overflow: ellipsis; }
.panel-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }

.panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 4px;
  background: var(--control-bg);
  color: #b9c2c6;
  font-size: 12px;
  line-height: 1;
  transition: background-color 90ms linear, color 90ms linear;
}
.panel-close:hover { background: #6b3a39; color: #ffd7d6; }

.panel-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 16px;
  padding: 0;
  flex: none;
  border: none;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
  transition: background-color 90ms linear, color 90ms linear;
}
.panel-action:hover:not(:disabled) { background: var(--control-bg-hover); color: var(--fg); }
.panel-action:disabled { opacity: 0.45; cursor: default; }
.panel-action svg { width: 12px; height: 12px; }

.panel-body { position: relative; flex: 1; min-height: 0; overflow: auto; }
`;
