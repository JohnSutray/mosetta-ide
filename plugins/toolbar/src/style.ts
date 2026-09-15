export const STYLE = `
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.is-on { background: #6a8759; }
.dot.is-off { background: var(--error); }

.toolbar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 3px 10px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 24px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  min-height: 24px;
}

.toolbar-icons { display: flex; gap: 2px; margin: 0 4px; flex: none; }

.tool-count {
  position: absolute;
  right: 1px;
  bottom: 0;
  min-width: 12px;
  padding: 0 2px;
  border-radius: 6px;
  background: var(--git-conflict);
  color: #2b1211;
  font-family: var(--ui-font);
  font-size: 9px;
  line-height: 12px;
  text-align: center;
}

.tool {
  position: relative; 
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: var(--control-bg);
  color: var(--muted);
  border-radius: 5px;
  transition: background-color 90ms linear, color 90ms linear;
}
.tool:hover { background: var(--control-bg-hover); color: var(--fg); }
.tool.is-active { background: var(--treesel); color: #dbe6ef; }
.tool.is-active:hover { background: #36699e; }

.toolbar-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 28ch;
  box-sizing: border-box;
  height: 22px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  font: 12px var(--ui-font);
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  transition: background-color 90ms linear, color 90ms linear;
}
.toolbar-chip:hover { background: var(--control-bg-hover); border-color: var(--divider); color: var(--fg); }
.toolbar-chip-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}
.toolbar-chip-icon svg { display: block; width: 14px; height: 14px; }
.toolbar-chip-text { overflow: hidden; text-overflow: ellipsis; }

.toolbar-chip.is-still { cursor: default; }

.toolbar-chip.is-warn { color: #be9117; }
.toolbar-chip.is-bad { color: var(--error, #ff6b68); }

.toolbar-chip.is-busy { animation: toolbar-chip-pulse 1.4s ease-in-out infinite; }
@keyframes toolbar-chip-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .toolbar-chip.is-busy { animation: none; opacity: 0.75; }
}

.toolbar-chip-more { opacity: 0.8; }
.toolbar-chip-more::before { content: '\\00B7'; margin-right: 6px; opacity: 0.6; }
`;
