export const STYLE = `
:root {
  --fg: #a9b7c6;
  --bg: #2b2b2b;
  --panel-bg: #3c4041;
  --divider: #4b4f51;
  --selection: #214283;
  --treesel: #2f5c8f;
  --muted: #808080;
  --control-bg: #45494b;
  --control-bg-hover: #53585a;
  --dir: #a9b7c6;
  --accent: #ffc66d;
  --error: #ff6b68;
  --git-modified: #6897bb;
  --git-added: #629755;
  --git-conflict: #e0655f;
  --noscan: #a3924a;
  --font: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  --ui-font: 'Inter', 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif;
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: #565a5c;
  border: 3px solid transparent;
  border-radius: 6px;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background: #6e7476; background-clip: content-box; }
::-webkit-scrollbar-corner { background: transparent; }

.field {
  background: var(--bg);
  border: 1px solid var(--divider);
  color: var(--fg);
  font: inherit;
  padding: 4px 6px;
  border-radius: 2px;
  cursor: text; 
}
.field:focus { outline: none; border-color: var(--treesel); }

.button {
  background: #4c5052;
  border: 1px solid var(--divider);
  color: var(--fg);
  font: inherit;
  padding: 4px 8px;
  border-radius: 2px;
}
.button:hover { background: #55595b; }

.button.is-danger { background: #6b3a39; color: #ffd7d6; }
.button.is-danger:hover { background: #7d4443; }
`;
