export const STYLE = `

.popup.is-full { border-radius: 0; border: none; }

.merge { --merge-line: 18px; }

.merge-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 44px 8px 12px;
  border-bottom: 1px solid var(--divider);
  font-family: var(--ui-font);
  flex: none;
}
.merge-title { color: var(--fg); font-size: 13px; }
.merge-path { color: var(--muted); font-size: 12px; }

.merge-body { display: flex; flex: 1; min-height: 0; }

.merge-files {
  width: 240px;
  flex: none;
  overflow: auto;
  border-right: 1px solid var(--divider);
  padding: 4px 0;
}
.merge-file {
  display: grid;
  grid-template-columns: 16px auto 1fr 14px;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-family: var(--ui-font);
  font-size: 12px;
  cursor: default;
}
.merge-file:hover { background: var(--control-bg); }
.merge-file.is-active { background: var(--treesel); }
.merge-file.is-done .merge-file-name { color: var(--muted); }
.merge-file-name { color: var(--fg); white-space: nowrap; }
.merge-file-dir {
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.merge-file-mark { color: var(--git-added); text-align: center; }

.merge-work { flex: 1; min-width: 0; display: flex; }
.merge-columns { flex: 1; min-width: 0; display: flex; }

.merge-column {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--divider);
}
.merge-column.is-right { border-right: none; }
.merge-column-title {
  flex: none;
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  font-family: var(--ui-font);
  font-size: 11px;
  color: var(--muted);
  background: var(--panel-bg);
  border-bottom: 1px solid var(--divider);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.merge-pane { flex: 1; min-height: 0; overflow: hidden; }
.merge-pane .cm-editor { height: 100%; }
.merge-pane .cm-scroller { overflow: auto; }

.merge-spacer {
  background: repeating-linear-gradient(
    135deg,
    transparent 0 4px,
    rgba(255, 255, 255, 0.035) 4px 8px
  );
}

.merge-line.is-left,
.merge-line.is-right,
.merge-line.is-both { background: rgba(98, 151, 85, 0.16); }
.merge-line.is-conflict { background: rgba(224, 101, 95, 0.16); }
.merge-line.is-conflict.is-open { background: rgba(224, 101, 95, 0.26); }
.merge-line.is-skipped { background: rgba(128, 128, 128, 0.1); opacity: 0.5; }
.merge-line.is-current { box-shadow: inset 2px 0 0 var(--accent); }

.merge-rail {
  flex: none;
  width: 44px;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-right: 1px solid var(--divider);
}
.merge-rail-scroll { flex: 1; min-height: 0; overflow: hidden; }
.merge-rail-body { position: relative; }
.merge-marks {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 2px;
  height: var(--merge-line);
}
.merge-marks.is-current { background: rgba(255, 198, 109, 0.12); }
.merge-mark {
  width: 18px;
  height: var(--merge-line);
  line-height: 1;
  border: none;
  border-radius: 3px;
  background: var(--control-bg);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.merge-mark:hover { background: var(--control-bg-hover); color: var(--fg); }
.merge-mark.is-take.is-on { background: var(--git-added); color: #10240c; }
.merge-mark.is-skip.is-on { background: var(--control-bg-hover); color: var(--error); }

.merge-whole { flex: 1; min-width: 0; display: flex; }
.merge-whole-cards { flex: 1; display: flex; gap: 12px; padding: 12px; min-width: 0; }
.merge-card {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--divider);
  border-radius: 6px;
  padding: 8px;
  background: var(--bg);
}
.merge-card-title { font-family: var(--ui-font); font-size: 12px; color: var(--muted); }
.merge-card-body { flex: 1; min-height: 0; overflow: hidden; }
.merge-card-body .code-view { height: 100%; }
.merge-card-body.is-gone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--git-conflict);
  border-radius: 4px;
  background: rgba(224, 101, 95, 0.06);
}
.merge-card-sign { font-size: 34px; opacity: 0.7; }
.merge-card-text { font-family: var(--ui-font); font-size: 13px; color: var(--git-conflict); }

.merge-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--divider);
  font-family: var(--ui-font);
}
.merge-status { flex: 1; color: var(--muted); font-size: 12px; }
.merge-button {
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  background: var(--control-bg);
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
}
.merge-button:hover { background: var(--control-bg-hover); }
.merge-button.is-main { background: var(--treesel); color: #dbe6ef; }
.merge-button.is-main:hover { background: #3a6ea8; }
.merge-button.is-quiet { color: var(--muted); }
.merge-button:disabled { opacity: 0.4; cursor: default; }
.merge-button:disabled:hover { background: var(--treesel); }

`;
