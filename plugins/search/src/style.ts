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

.se-coverage {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 12px 6px;
  color: var(--muted);
  font-size: 11px;
}
.se-raise {
  flex: none;
  padding: 1px 7px;
  border: none;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--fg);
  font: inherit;
  font-family: var(--mono, monospace);
  cursor: pointer;
}
.se-raise:hover { background: #45494a; }
.se-raise-key { flex: none; font-family: var(--mono, monospace); }

.se-kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 10px 6px;
}
.se-kind {
  padding: 1px 8px;
  border: none;
  border-radius: 10px;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
  background: var(--control-bg);
  color: var(--muted);
}
.se-kind.is-on { background: var(--treesel); color: #dbe6ef; }
.se-kind.is-off { opacity: 0.65; }
.se-kind:hover { filter: brightness(1.15); }

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
