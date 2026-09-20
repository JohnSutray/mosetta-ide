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
  --warning: #be9117;
  --info: #6897bb;
  --hint: #808080;
  --git-modified: #6897bb;
  --git-added: #629755;
  --git-conflict: #e0655f;
  --diff-added-bg: #294436;
  --diff-removed-bg: #452b2c;
  --noscan: #a3924a;
  --debug-breakpoint: #db5c5c;
  --debug-line: #2d6099;
  --font: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  --ui-font: 'Inter', 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif;
}

input[type='checkbox'] {
  appearance: none;
  flex: none;
  margin: 0;
  width: 13px;
  height: 13px;
  border: 1px solid var(--divider);
  border-radius: 2px;
  background: var(--control-bg);
  cursor: default;
}
input[type='checkbox']:hover { background: var(--control-bg-hover); }
input[type='checkbox']:checked,
input[type='checkbox']:indeterminate {
  background: #5a5f61;
  border-color: #6d7376;
}
input[type='checkbox']:checked::after {
  content: '';
  display: block;
  width: 3px;
  height: 7px;
  margin: 0 auto;
  transform: translateY(-1px) rotate(45deg);
  border: solid var(--fg);
  border-width: 0 2px 2px 0;
}
input[type='checkbox']:indeterminate::after {
  content: '';
  display: block;
  width: 7px;
  height: 2px;
  margin: 4px auto;
  background: var(--fg);
}
input[type='checkbox']:disabled { opacity: 0.45; }

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

*, *::before, *::after {
  font-variant-ligatures: none !important;
  font-feature-settings: 'calt' 0, 'liga' 0, 'dlig' 0 !important;
}

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
