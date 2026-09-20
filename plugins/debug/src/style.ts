/**
 * The debugger's styling. The colours are the theme's variables: the breakpoint and the
 * line being executed are declared there (`--debug-breakpoint`, `--debug-line`), and
 * only the shape is here.
 */
export const STYLE = `
.column-debug { background: var(--panel-bg); }

.cm-debug-gutter { width: 14px; padding: 0; cursor: pointer; }
.cm-debug-gutter .cm-gutterElement { padding: 0; display: flex; align-items: center; justify-content: center; }
.cm-breakpoint {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--debug-breakpoint);
  background: var(--debug-breakpoint);
}
.cm-breakpoint.is-pending { background: transparent; }
.cm-breakpoint.is-conditional::after {
  content: '?';
  display: block;
  font: bold 8px/9px var(--ui-font);
  text-align: center;
  color: var(--panel-bg);
}
.cm-breakpoint.is-pending.is-conditional::after { color: var(--debug-breakpoint); }
.cm-breakpoint.is-log { border-radius: 1px; transform: rotate(45deg) scale(0.85); }

.debug { display: flex; flex-direction: column; height: 100%; min-height: 0; font: 12px/1.4 var(--ui-font); }
.debug-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.debug-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--fg);
  cursor: pointer;
}
.debug-btn:hover:not(:disabled) { background: var(--control-bg-hover); }
.debug-btn:disabled { color: var(--muted); cursor: default; opacity: 0.55; }
.debug-btn.is-go { color: #6a8759; }
.debug-btn.is-stop { color: var(--error); }
.debug-btn.is-kill { color: var(--error); }
.debug-btn.is-kill svg { transform: scale(1.05); }
.debug-bar-gap { width: 6px; }
.debug-run {
  margin-left: auto;
  flex: 1 1 auto;
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 11px;
}
.debug-run b { color: var(--fg); font-weight: 500; }

.debug-run-forget {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border-radius: 4px;
  background: var(--control-bg);
  color: #b9c2c6;
  cursor: pointer;
  vertical-align: middle;
}
.debug-run-forget:hover { background: #6b3a39; color: #ffd7d6; }
.debug-run.is-paused b { color: var(--accent); }
.debug-run.is-error { color: var(--error); }

.debug-exc {
  height: 22px;
  padding: 0 4px;
  border: none;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--fg);
  font: 11px var(--ui-font);
}
.debug-body { flex: 1; min-height: 0; overflow: auto; }
.debug-watch-remove {
  margin-left: auto;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
  line-height: 1;
}
.debug-watch-remove:hover { color: var(--fg); background: var(--control-bg-hover); }
.debug-var-value.is-error { color: var(--warning); font-style: italic; }
.debug-console { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-top: 1px solid var(--divider); flex: none; }
.debug-console-prompt { color: var(--muted); font: 13px var(--font); }
.debug-console-field { flex: 1; min-width: 0; font: 12px var(--font); padding: 2px 6px; }
.debug-output .is-repl { color: var(--accent); }

.debug-edit { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; }
.debug-edit-title { color: var(--muted); font: 11px var(--ui-font); }
.debug-edit-row { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 8px; font: 12px var(--ui-font); }
.debug-edit-row input { font: 12px var(--font); padding: 3px 6px; min-width: 0; }
.debug-edit-actions { display: flex; gap: 6px; margin-top: 4px; }
.debug-edit-btn { width: auto; padding: 0 10px; font: 12px var(--ui-font); }
.debug-edit-btn.is-quiet { background: transparent; color: var(--muted); }
.debug-edit-btn.is-quiet:hover { background: var(--control-bg); color: var(--fg); }
.debug-url { display: flex; gap: 4px; padding: 5px 8px; border-bottom: 1px solid var(--divider); }
.debug-url-field { flex: 1; min-width: 0; font: 12px var(--ui-font); padding: 2px 6px; }
.debug-url-go { width: auto; padding: 0 8px; font: 12px var(--ui-font); }
.debug-section { border-bottom: 1px solid var(--divider); }
.debug-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px 2px;
  background: var(--panel-bg);
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.debug-head-more { margin-left: auto; text-transform: none; letter-spacing: 0; font-style: italic; }
.placeholder.debug-empty { padding: 10px 8px; color: var(--muted); }
.debug-empty p { margin: 0 0 6px; }
.debug-note {
  padding: 4px 8px;
  color: var(--warning);
  font-size: 11px;
  border-bottom: 1px solid var(--divider);
}
.debug-note.is-warn { color: var(--error); }

.debug-frames { list-style: none; margin: 0; padding: 2px 0 4px; }
.debug-frame {
  display: flex;
  gap: 8px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.debug-frame:hover { background: #45494a; }
.debug-frame.is-current { background: var(--treesel); color: #dbe6ef; }
.debug-frame.is-faint { color: var(--muted); }
.debug-frame-name { flex: none; font-family: var(--font); }
.debug-frame-where { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted); direction: rtl; text-align: left; }
.debug-frame.is-current .debug-frame-where { color: #c6d3dd; }

.debug-vars { list-style: none; margin: 0; padding: 2px 0 4px; }
.debug-var {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  white-space: nowrap;
  cursor: default;
}
.debug-var.can-open { cursor: pointer; }
.debug-var:hover { background: #45494a; }
.debug-var-arrow { flex: none; width: 10px; color: var(--muted); }
.debug-var-arrow.is-leaf { visibility: hidden; }
.debug-var-name { flex: none; color: var(--const, #9876aa); font-family: var(--font); }
.debug-var-name.is-scope { color: var(--fg); font-family: var(--ui-font); }
.debug-var-eq { color: var(--muted); }
.debug-var-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-family: var(--font); color: var(--fg); }
.debug-var-loading { color: var(--muted); font-style: italic; padding: 1px 8px; }

.debug-output { margin: 0; padding: 4px 8px; font: 11px/1.4 var(--font); white-space: pre-wrap; word-break: break-word; }
.debug-output .is-stderr { color: var(--error); }
.debug-output .is-console { color: var(--muted); }

.debug-foreign { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.debug-foreign-head {
  flex: none;
  padding: 3px 10px;
  border-bottom: 1px solid var(--divider);
  color: var(--muted);
  font: 11px var(--ui-font);
}
.debug-foreign-body { flex: 1; min-height: 0; }
.debug-foreign-body .code-view, .debug-foreign-body .cm-editor { height: 100%; }
.debug-foreign-gone { padding: 20px; color: var(--muted); text-align: center; }
`;
