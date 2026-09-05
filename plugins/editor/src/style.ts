export const STYLE = `
.editor { height: 100%; }
.editor .cm-editor { height: 100%; }
.editor .cm-editor.cm-focused { outline: none; }
.editor .cm-content { user-select: text; cursor: text; }

.cm-tooltip.cm-tooltip-hover {
  background: transparent;
  border: none;
  padding: 16px;
  max-width: 672px;
  pointer-events: none;
}
.cm-tooltip-hover.cm-tooltip-above { margin-top: 16px; }
.cm-tooltip-hover.cm-tooltip-below { margin-top: -16px; }
.cm-tooltip.cm-tooltip-hover { margin-left: -16px; }

.cm-hover-card {
  padding: 6px 8px;
  max-width: 640px;
  background: #3b3e40;
  border: 1px solid var(--divider);
  border-radius: 3px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  white-space: pre-wrap;
  font: 12px/1.4 var(--font);
  color: var(--fg);
  cursor: text;
  user-select: text;
  pointer-events: auto;
}
.cm-hover-problem {
  border-left: 2px solid var(--error);
  padding-left: 7px;
  margin-bottom: 6px;
}
.cm-hover-problem:last-child { margin-bottom: 0; }
.cm-hover-problem + .cm-hover-code {
  border-top: 1px solid var(--divider);
  padding-top: 6px;
}

.cm-gitgutter {
  width: 9px;
  padding: 0;
  cursor: pointer;
}
.cm-gitgutter .cm-gutterElement { padding: 0; }
.cm-gitmark {
  width: 6px;
  height: 100%;
  margin-left: 1px;
  border-radius: 0;
}
.cm-gitmark.is-added { background: var(--git-added); }
.cm-gitmark.is-modified { background: var(--git-modified); }

.cm-gitmark.is-removed {
  width: 0;
  height: 0;
  margin-top: 1px;
  border-left: 7px solid var(--git-modified);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-radius: 0;
}

.tag {
  padding: 0 5px;
  border: 1px solid var(--divider);
  border-radius: 2px;
  color: var(--muted);
}
.tag.is-dirty { color: var(--accent); border-color: var(--accent); }

.editor-nothing {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: var(--muted);
}

.diverged {
  position: absolute;
  top: 6px;
  right: 18px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid #6b5a2a;
  border-radius: 5px;
  background: #3a3524;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  font-family: var(--ui-font);
  font-size: 12px;
  color: #d6c98a;
}
.diverged-sign { color: var(--accent); font-size: 13px; line-height: 1; }
.diverged-text { white-space: nowrap; }
.diverged-button {
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  background: var(--control-bg);
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
}
.diverged-button:hover { background: var(--control-bg-hover); }
.diverged-button.is-quiet { background: transparent; color: var(--muted); }
.diverged-button.is-quiet:hover { background: var(--control-bg); color: var(--fg); }

.editor-host { position: relative; height: 100%; min-height: 0; }
`;
