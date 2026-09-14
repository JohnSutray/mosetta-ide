export const STYLE = `
.lsp-sweep { display: flex; align-items: center; gap: 6px; }

.lsp-sweep-one {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  font: 12px var(--ui-font);
  white-space: nowrap;
  cursor: pointer;
}
.lsp-sweep-one:hover { background: var(--control-bg-hover); border-color: var(--divider); }
.lsp-sweep-one svg { flex: none; display: block; }

.lsp-sweep-one.is-working { animation: lsp-sweep-pulse 1.4s ease-in-out infinite; }
@keyframes lsp-sweep-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .lsp-sweep-one.is-working { animation: none; opacity: 0.75; }
}

.lsp-sweep-one.is-capped { color: #be9117; }

.lsp-sweep-mb { opacity: 0.8; }
.lsp-sweep-mb::before { content: '·'; margin-right: 6px; opacity: 0.6; }
`;
