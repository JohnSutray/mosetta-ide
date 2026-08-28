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
`;
