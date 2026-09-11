export const STYLE = `
.settings-top { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--divider); }
.settings-title { flex: none; color: var(--fg); font: 13px var(--ui-font); }
.settings-filter { flex: 1; }
.settings-list { flex: 1; overflow: auto; padding: 0 0 12px; }
.settings-group-head {
  position: sticky; top: 0; z-index: 1;
  display: flex; align-items: baseline; gap: 8px;
  padding: 12px 14px 6px; background: var(--panel-bg);
}
.settings-group-title { color: var(--fg); font: 600 12px var(--ui-font); }
.settings-group-owner { color: var(--muted); font: 11px var(--mono, monospace); }
.settings-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 320px) auto;
  align-items: center; gap: 12px; padding: 5px 14px;
}
.settings-row:hover { background: var(--control-bg); }
.settings-name { display: flex; flex-direction: column; min-width: 0; }
.settings-label { color: var(--fg); font: 12px var(--ui-font); }
.settings-row.is-set .settings-label { color: var(--accent); }
.settings-path { overflow: hidden; color: var(--muted); font: 11px var(--mono, monospace); text-overflow: ellipsis; white-space: nowrap; }
.settings-value .field { box-sizing: border-box; width: 100%; }
.settings-value textarea.field { resize: vertical; font-family: var(--mono, monospace); }
.settings-check { width: 14px; height: 14px; margin: 0; }
.settings-object { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.settings-object code { overflow: hidden; color: var(--muted); font: 11px var(--mono, monospace); text-overflow: ellipsis; white-space: nowrap; }
.settings-note { color: var(--muted); font: 11px var(--ui-font); }
.settings-reset { padding: 3px 8px; border: none; border-radius: 4px; background: var(--control-bg); color: var(--fg); font: 11px var(--ui-font); cursor: pointer; }
.settings-reset:disabled { opacity: 0.35; cursor: default; }
.settings-empty { padding: 24px; color: var(--muted); text-align: center; }
`;
