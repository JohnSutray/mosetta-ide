export const STYLE = `

.symbols-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.symbols-title { color: var(--fg); font-size: 12px; }
.symbols-count { color: var(--muted); font-size: 11px; }

.symbols-filter {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}
.symbols-filter:hover { background: var(--control-bg-hover); color: var(--fg); }
.symbols-filter.is-on { background: var(--treesel); color: #dbe6ef; }

.symbols-list {
  flex: none;
  min-height: 60px;
  overflow: auto;
  display: grid;
  grid-template-columns: max-content max-content minmax(0, 1fr);
  align-content: start;
}
.symbols-row { display: contents; cursor: pointer; }
.symbols-row > * { padding: 2px 0; white-space: nowrap; }
.symbols-row.is-current > * { background: var(--treesel); }
.symbols-where {
  padding-left: 8px;
  color: #9aa3a8;
  font-size: 11px;
}
.symbols-line {
  padding: 2px 10px 2px 5px;
  text-align: right;
  color: var(--accent);
  font-size: 11px;
}
.symbols-text {
  padding-right: 8px;
  color: var(--fg);
  font-family: var(--mono, monospace);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.symbols-preview { flex: 1 1 auto; min-height: 0; border-top: 1px solid var(--divider); overflow: hidden; }
.symbols-preview .cm-editor { height: 100%; }
.symbols-more {
  grid-column: 1 / -1;
  padding: 3px 8px;
  color: var(--muted);
  font-size: 11px;
  font-style: italic;
}

`;
