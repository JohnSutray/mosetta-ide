export const STYLE = `
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
`;
