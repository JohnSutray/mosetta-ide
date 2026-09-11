export const STYLE = `

.notes {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 80;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: min(420px, calc(var(--mount-w, 100vw) * 0.46));
}

.notes-all {
  color: var(--muted);
  font: 11px var(--ui-font);
  padding: 2px 6px;
}
.notes-all:hover { color: var(--fg); }

.note {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 6px 8px 6px 10px;
  border: 1px solid var(--divider);
  border-left: 3px solid var(--muted);
  border-radius: 4px;
  background: #3a3f41;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  font: 12px/1.4 var(--ui-font);
}
.note.is-error { border-left-color: var(--error); }
.note.is-work { border-left-color: var(--git-modified); }
.note-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.note-close {
  flex: none;
  color: var(--muted);
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
}
.note-close:hover { color: var(--error); }

.spinner {
  width: 10px;
  height: 10px;
  flex: none;
  border: 2px solid rgba(219, 230, 239, 0.25);
  border-top-color: #dbe6ef;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
`;
