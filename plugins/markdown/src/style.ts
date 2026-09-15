export const STYLE = `
.md-host { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }

.md-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 4px 8px;
  border-bottom: 1px solid var(--divider);
  background: var(--panel-bg);
  font: 11px var(--ui-font);
  color: var(--muted);
}
.md-facts { margin-left: auto; white-space: nowrap; }

.md-split { display: flex; flex: 1; min-height: 0; }
.md-text { flex: 1; min-width: 0; border-right: 1px solid var(--divider); }
.md-preview { flex: 1; min-width: 0; overflow: auto; }

.md-page {
  padding: 16px 22px 40px;
  color: var(--fg);
  font: 13px/1.6 var(--ui-font);
  max-width: 76ch;
}

.md-heading { margin: 22px 0 8px; font-weight: 600; line-height: 1.3; }
.md-page > .md-heading:first-child { margin-top: 0; }
h1.md-heading { font-size: 20px; padding-bottom: 6px; border-bottom: 1px solid var(--divider); }
h2.md-heading { font-size: 17px; padding-bottom: 4px; border-bottom: 1px solid var(--divider); }
h3.md-heading { font-size: 15px; }
h4.md-heading, h5.md-heading, h6.md-heading { font-size: 13px; color: var(--muted); }

.md-p { margin: 0 0 10px; }
.md-rule { margin: 18px 0; border: 0; border-top: 1px solid var(--divider); }

.md-list { margin: 0 0 10px; padding-left: 22px; }
.md-list .md-list { margin: 4px 0 0; }
.md-list li { margin: 2px 0; }
.md-list li > .md-p:last-child { margin-bottom: 0; }

.md-quote {
  margin: 0 0 10px;
  padding: 2px 0 2px 12px;
  border-left: 3px solid var(--divider);
  color: var(--muted);
}
.md-quote > :last-child { margin-bottom: 0; }

.md-code {
  position: relative;
  margin: 0 0 12px;
  padding: 10px 12px;
  overflow-x: auto;
  background: var(--panel-bg);
  border: 1px solid var(--divider);
  border-radius: 6px;
  font: 12px/1.45 var(--mono, monospace);
  white-space: pre;
}
.md-code code { font: inherit; }
.md-code-lang {
  position: absolute;
  top: 4px;
  right: 8px;
  color: var(--muted);
  font: 10px var(--ui-font);
  opacity: 0.7;
}

.md-inline-code {
  padding: 1px 4px;
  background: var(--control-bg);
  border-radius: 3px;
  font: 12px var(--mono, monospace);
}

.md-link { color: var(--accent); text-decoration: none; }
.md-link:hover { text-decoration: underline; }

.md-table-box { overflow-x: auto; margin: 0 0 12px; }
.md-table { border-collapse: collapse; font-size: 12px; }
.md-table th, .md-table td {
  padding: 4px 10px;
  border: 1px solid var(--divider);
  text-align: left;
  vertical-align: top;
}
.md-table th { background: var(--panel-bg); font-weight: 600; }

.md-image-shown { max-width: 100%; border-radius: 4px; }
.md-image {
  display: inline-block;
  padding: 1px 6px;
  border: 1px dashed var(--divider);
  border-radius: 4px;
  color: var(--muted);
  font-size: 11px;
}
`;
