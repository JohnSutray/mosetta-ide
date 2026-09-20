/** The scripts' own styling. */
export const STYLE = `

.scripts { padding: 3px 0; }
.scripts-package {
  padding: 6px 10px 2px;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.script {
  display: flex;
  flex-direction: column;
  padding: 3px 10px;
  border-left: 2px solid transparent;
}
.script:hover { background: #45494a; }
.script-command { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.script.has-terminal { border-left-color: #6a8759; }
.script.terminal-dead { border-left-color: var(--divider); }

.script-action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 18px;
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
}
.script-action:hover { background: var(--control-bg-hover); color: var(--fg); }

.script-action { visibility: hidden; }
.pick-row:hover .script-action,
.pick-row.is-current .script-action { visibility: visible; }
.pick-row.is-current .script-action { color: #dbe6ef; }
`;
