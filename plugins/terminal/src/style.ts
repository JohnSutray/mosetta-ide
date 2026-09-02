export const STYLE = `
.term-chip {
  display: inline-flex;
  align-items: stretch;
  height: 20px;
  border: 1px solid var(--divider);
  border-radius: 4px;
  overflow: hidden;
  background: #35393a;
  color: var(--muted);
  transition: background-color 90ms linear, color 90ms linear, border-color 90ms linear;
}
.term-chip:hover { background: #454a4b; color: var(--fg); }

.term-chip-name {
  display: flex;
  align-items: center;
  padding: 0 7px;
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.term-chip-close {
  display: flex;
  align-items: center;
  padding: 0 6px;
  border-left: 1px solid var(--divider);
  color: var(--muted);
  font-size: 13px;
  line-height: 1;
}
.term-chip-close:hover { background: #6b3a39; color: #ffd7d6; }

.term-chip.is-alive .term-chip-name { color: var(--fg); }

.term-chip.is-busy { background: var(--treesel); border-color: #3d6d9e; color: #dbe6ef; }
.term-chip.is-busy:hover { background: #36699e; }
.term-chip.is-busy .term-chip-name { color: #dbe6ef; }
.term-chip.is-busy .term-chip-close { border-left-color: #3d6d9e; color: #cfe0ee; }

.term-chip.is-current { border-color: var(--accent); }
.term-chip.is-current .term-chip-name { color: var(--accent); }
.term-chip.is-busy.is-current { border-color: var(--accent); }
.term-chip.is-busy.is-current .term-chip-name { color: #ffe9bd; }

.term-chip.is-dead { opacity: 0.55; font-style: italic; }

.term-host { height: 100%; padding: 4px 0 0 6px; }
.term-host .xterm { height: 100%; }
.term-host .xterm-screen { cursor: text; }
.term-host .xterm .xterm-viewport { background: transparent !important; }
`;
