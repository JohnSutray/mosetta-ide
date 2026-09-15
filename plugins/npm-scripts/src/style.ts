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
`;
