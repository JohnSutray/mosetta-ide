export const STYLE = `

.branches { display: flex; flex-direction: column; }

.branches-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.branches-title { font-size: 14px; }
.branches-meta { color: var(--muted); font-size: 12px; }

.branch-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0;
  border-top: 1px solid var(--divider);
}

.branch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  white-space: nowrap;
  font: 13px/1.4 var(--ui-font);
}
.branch-row:hover { background: #45494a; }
.branch-row.is-current { background: var(--treesel); color: #dbe6ef; }
.branch-head {
  padding: 6px 10px 2px;
  color: var(--muted);
  font: 11px/1.4 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.branch-head.is-remote {
  padding-left: 20px;
  text-transform: none;
  letter-spacing: 0;
  color: #9aa4a8;
}

.branch-row.is-remote .branch-name { color: var(--muted); }
.branch-row.is-remote.is-current .branch-name { color: #cfe0ee; }
.branch-mark { width: 8px; flex: none; color: var(--git-added); }
.branch-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.branch-sha { flex: none; color: var(--muted); font: 11px var(--font); }

.branch-more {
  flex: none;
  display: flex;
  align-items: center;
  width: 10px;
  color: var(--muted);
  opacity: 0.6;
}
.branch-row.is-current .branch-more { opacity: 1; color: #dbe6ef; }

.branches-fetch { flex: none; margin-left: auto; }
.branch-row.is-current .branch-sha { color: #c6d3dd; }

.branches-foot .button { padding: 3px 10px; }

.git-log {
  margin: 0;
  max-height: calc(var(--mount-h, 100vh) * 0.3);
  overflow: auto;
  padding: 6px 10px;
  border-top: 1px solid var(--divider);
  background: var(--bg);
  color: var(--fg);
  font: 12px/1.45 var(--font);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.button:disabled { opacity: 0.5; }
.button.is-running { display: inline-flex; align-items: center; gap: 6px; }

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

.push { display: flex; flex-direction: column; }

.push-split {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 1px;
  background: var(--divider);
}

.push-files {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-width: 220px;
  max-width: calc(100% - 300px);
  background: var(--panel-bg);
}

.push-split .resizer { margin: 0; background: var(--divider); }
.push-split .resizer:hover,
.push-split .resizer:active { background: var(--treesel); }
.push-files-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 3px 0;
}
.push-files-body .changed { width: max-content; min-width: 100%; }

.push-message {
  flex: 0 0 auto;
  min-height: 48px;
  max-height: calc(100% - 120px);
  overflow: auto;
  padding: 6px 10px 8px;
  background: var(--bg);
  user-select: text;
}
.push-message-head {
  color: var(--muted);
  font: 11px/1.4 var(--ui-font);
  margin-bottom: 4px;
}
.push-message-text {
  font: 12px/1.5 var(--font);
  white-space: pre-wrap;
  word-break: break-word;
}

.resizer.is-y {
  width: auto;
  height: 5px;
  margin: 0;
  cursor: row-resize;
  background: var(--divider);
}
.resizer.is-y:hover,
.resizer.is-y:active { background: var(--treesel); }

.changed-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding-right: 8px;
  white-space: nowrap;
  font: 13px/1.35 var(--ui-font);
}
.changed-name { flex: none; }
.changed-count {
  flex: none;
  margin-left: 6px;
  color: var(--muted);
  font-size: 11px;
}
.changed-row.git-modified .changed-name { color: var(--git-modified); }
.changed-row.git-added .changed-name { color: var(--git-added); }
.changed-row.git-deleted .changed-name { color: var(--git-deleted, #7a7a7a); text-decoration: line-through; }
.changed-row.git-conflict .changed-name { color: var(--git-conflict); }

.push-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--panel-bg);
}

.push-fork {
  display: flex;
  flex: 0 1 auto;
  min-height: 0;
  max-height: 60%;
  gap: 1px;
  background: var(--divider);
  border-bottom: 2px solid var(--divider);
}
.push-fork .push-lane { flex: 1 1 50%; background: var(--panel-bg); }

.push-lane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--panel-bg);
}
.push-lane.is-common { flex: 1 1 auto; min-height: 0; }

.push-lane-title {
  flex: none;
  padding: 6px 10px 4px;
  color: var(--muted);
  font: 11px/1.4 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--divider);
}
.push-lane.is-local .push-lane-title { color: var(--git-added); }
.push-lane.is-remote .push-lane-title { color: var(--git-modified); }
.push-lane.is-doomed .push-lane-title { color: var(--error); }

.push-lane-body { flex: 1; min-height: 0; overflow: auto; padding: 3px 0; }

.push-commit {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 10px;
  font: 12px/1.5 var(--ui-font);
  white-space: nowrap;
}
.push-sha { flex: none; color: var(--muted); font: 11px var(--font); }
.push-commit.is-pickable:not(.is-current):hover { background: #45494a; }
.push-commit.is-current { background: var(--treesel); color: #dbe6ef; }
.push-commit.is-current .push-sha { color: #c6d3dd; }
.push-subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

.push-lane.is-common .push-commit { color: var(--muted); }
.push-lane.is-local .push-commit { color: var(--fg); }
.push-lane.is-remote .push-commit { color: var(--git-modified); }

.push-lane.is-doomed .push-commit {
  color: #6b7073;
  text-decoration: line-through;
}

.push-empty { padding: 4px 10px; color: var(--muted); font: 12px var(--ui-font); }

.push-force {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font: 12px var(--ui-font);
}
.push-force input {
  appearance: none;
  margin: 0;
  width: 13px;
  height: 13px;
  border: 1px solid var(--divider);
  background: var(--control-bg);
  cursor: pointer;
}
.push-force input:hover { background: var(--control-bg-hover); }
.push-force input:checked {
  background: var(--treesel);
  border-color: #4c7db3;
}
.push-force input:checked::after {
  content: '';
  display: block;
  width: 3px;
  height: 7px;
  margin: 0 auto;
  transform: translateY(-1px) rotate(45deg);
  border: solid #dbe6ef;
  border-width: 0 2px 2px 0;
}
.push-force.is-armed input:checked { background: #6b3a39; border-color: #8a4a49; }
.push-force.is-armed { color: var(--error); }

.push-spacer { flex: 1; }

.branch-label {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 28ch;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--fg);
  font: 12px var(--ui-font);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.branch-label:hover { background: var(--control-bg-hover); border-color: var(--divider); }

.tool-label {
  flex: none;
  max-width: 16ch;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  font: 12px var(--ui-font);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.tool-label:hover { background: var(--control-bg-hover); border-color: var(--divider); color: var(--fg); }

.branch-track {
  flex: none;
  display: flex;
  gap: 4px;
  font: 11px var(--font);
}
.branch-row .branch-ahead,
.branch-row .branch-behind {
  display: inline-block;
  width: 3.5ch;
  text-align: right;
}
.branch-ahead { color: var(--git-added); }
.branch-behind { color: var(--git-modified); }

.tool.is-fetch:hover { background: var(--control-bg-hover); }

.branches-filter { flex: none; padding: 6px 8px; }
.branches-filter .field { width: 100%; }

.branch-prompt {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid var(--divider);
}
.branch-prompt .field { flex: 1; }
.branch-prompt-title { color: var(--muted); font: 12px var(--ui-font); flex: none; }

.hunk-popup {
  position: fixed;
  z-index: 60;
  border-radius: 0;
  max-width: min(calc(var(--mount-w, 100vw) * 0.7), 720px);
  max-height: calc(var(--mount-h, 100vh) * 0.5);
  overflow: auto;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border: 1px solid var(--divider);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.hunk-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--divider);
}
.hunk-title { color: var(--muted); font: 12px var(--ui-font); white-space: nowrap; }
.hunk-before { padding: 4px 0; }
.hunk-line {
  padding: 0 10px;
  font: 12px/1.45 var(--font);
  white-space: pre;
  color: #c9a9a7;
  background: rgba(107, 58, 57, 0.28);
}
`;
