export const STYLE = `

.projects-popup { display: flex; flex-direction: column; }
.projects {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.recent {
  flex: none;
  max-height: 34%;
  overflow: auto;
  padding: 4px 0;
  border-bottom: 1px solid var(--divider);
}
.recent-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 21px;
  padding: 0 8px;
  white-space: nowrap;
  font: 13px/1.35 var(--ui-font);
}
.recent-row:hover { background: #45494a; }
.recent-row.is-current { background: var(--treesel); color: #dbe6ef; }
.recent-icon { flex: none; display: flex; color: var(--accent); }
.recent-name { flex: none; overflow: hidden; text-overflow: ellipsis; }
.recent-meta {
  flex: 0 1 auto;
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-row.is-current .recent-meta { color: #c6d3dd; }

.open-form { flex: none; padding: 6px; }

.open-row { position: relative; display: flex; gap: 4px; }
.open-row .field { flex: 1; min-width: 0; }
.open-row .button { flex: none; }

.suggest {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 5;
  max-height: 40vh;
  overflow: auto;
  border: 1px solid var(--divider);
  border-radius: 2px;
  background: var(--bg);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}
.suggest.is-empty { padding: 4px 6px; color: var(--muted); }

.picker-more {
  padding: 2px 6px;
  color: var(--muted);
  font-style: italic;
  cursor: pointer;
}
.picker-more:hover { color: var(--fg); background: var(--control-bg); }
.suggest-row {
  padding: 2px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font: 13px/1.4 var(--ui-font);
}
.suggest-row:hover { background: #45494a; }
.suggest-row.is-current { background: var(--treesel); color: #dbe6ef; }

.picker {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 3px 0;
  width: max-content;
  min-width: 100%;
  font: 13px/1.35 var(--ui-font);
}
.picker-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 21px;
  padding-right: 8px;
  white-space: nowrap;
}
.picker-row:hover { background: #45494a; }
.picker-row.is-current { background: var(--treesel); color: #dbe6ef; }
.picker-name { flex: none; }

.projects-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.projects-title { font-size: 14px; }
`;
