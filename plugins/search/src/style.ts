export const STYLE = `

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
