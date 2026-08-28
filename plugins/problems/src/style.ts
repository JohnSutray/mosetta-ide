export const STYLE = `
.column-problems { background: var(--panel-bg); }

.problems { list-style: none; margin: 0; padding: 4px 0; }
.problem {
  display: flex;
  gap: 8px;
  padding: 3px 8px;
  align-items: baseline;
}
.problems-list { padding-bottom: 6px; }
.problems-where {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 8px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--divider);
  color: #9aa3a8;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.problems-where:hover { color: var(--fg); }
.problems-where.is-current { color: var(--fg); }
.problems-path { overflow: hidden; text-overflow: ellipsis; }
.problems-count { margin-left: auto; color: var(--muted); }
.problems-more { padding: 4px 8px; color: var(--muted); font-size: 11px; font-style: italic; }

.problem.is-error { background: rgba(255, 107, 104, 0.1); }
.problem.is-warning { background: rgba(190, 145, 23, 0.12); }

.problem:hover,
.problem.is-error:hover,
.problem.is-warning:hover { background: #45494a; }
.problem-where { color: var(--muted); flex: none; }
.problem-what { flex: 1; white-space: pre-wrap; }
.problem.is-error .problem-where { color: var(--error); }
.problem.is-warning .problem-where { color: #be9117; }
.problem-code { color: var(--muted); flex: none; }
`;
