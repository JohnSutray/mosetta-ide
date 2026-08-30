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

.panel-body { position: relative; flex: 1; min-height: 0; overflow: auto; }
`;
