export const STYLE = `
.keys-help { padding: 10px 12px; gap: 8px; }

.keys-head { display: flex; flex-direction: column; gap: 4px; flex: none; }
.keys-title { font-size: 13px; color: var(--fg); }
.keys-note { color: var(--muted); font-size: 11px; line-height: 1.45; }
.keys-note.is-loud { color: var(--fg); }

.keys-echo {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--control-bg);
  border-radius: 4px;
}
.keys-echo-label { color: var(--muted); font-size: 11px; flex: none; }
.keys-echo-arrow { color: var(--muted); flex: none; }
.keys-echo-command { color: var(--fg); font-size: 12px; }
.keys-echo-command.is-free { color: var(--muted); font-style: italic; }
.keys-echo-context { margin-left: auto; color: var(--muted); font-size: 11px; flex: none; }
.keys-hint { flex: none; color: var(--muted); font-size: 11px; }

.keys-list { flex: 1; min-height: 0; overflow: auto; padding-right: 4px; }
.keys-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 10px;
  align-items: baseline;
}
.keys-grid.has-who { grid-template-columns: max-content 1fr max-content; }
.keys-row { display: contents; }
.keys-group-title {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 0 4px;
  border-bottom: 1px solid var(--divider);
  margin-bottom: 2px;
}
.keys-grid > .keys-group-title:first-child { padding-top: 2px; }
.keys-command { color: var(--fg); font-size: 12px; padding: 2px 0; }
.keys-blocked { margin-left: auto; color: var(--error); font-size: 11px; }

.keys-kbd {
  justify-self: start;
  margin: 2px 0;
  padding: 1px 6px;
  background: var(--control-bg);
  border-radius: 3px;
  color: var(--accent);
  font-family: var(--mono, monospace);
  font-size: 11px;
  white-space: nowrap;
}

.keys-taken { margin-bottom: 10px; }
.keys-taken > summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 11px;
  padding: 4px 0;
  list-style: none;
}
.keys-taken > summary::-webkit-details-marker { display: none; }
.keys-taken > summary::before { content: '▸ '; }
.keys-taken[open] > summary::before { content: '▾ '; }
.keys-taken > summary:hover { color: var(--fg); }
.keys-taken.is-ours > summary { color: #a09461; }
.keys-taken.is-ours > summary:hover { color: #c9bc80; }
.keys-kbd.is-dead {
  color: #c98a83;
  background: #3f3536;
  text-decoration: line-through;
  text-decoration-color: #8f6a66;
}
.keys-kbd.is-soft {
  color: #b3ae86;
  background: #3c3a2f;
}
.keys-who { justify-self: end; color: var(--muted); font-size: 11px; }

.keys-hosts { display: inline-flex; gap: 4px; margin-left: 10px; vertical-align: middle; }
.keys-host {
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}
.keys-host:hover { background: var(--control-bg-hover); color: var(--fg); }
.keys-host.is-on { background: var(--treesel); color: #dbe6ef; }

`;
