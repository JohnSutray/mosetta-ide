# @mosetta/ide-plugin-debug

The debugger: breakpoints, running under the debugger, the stack, the variables, steps.

Two halves. The server one is a DAP client on top of the `vscode-js-debug` adapter: the
tree of sessions, the breakpoints, the stack, the variables, evaluation, the text of
sources beyond the root, and the program in the neighbour's real terminal. The client one
is the breakpoints in the editor's gutter (`editor.extension`), the line being executed,
the panel (steps, frames, variables, output), the value under the cursor
(`editor.hover`), the view of files beyond the root (`file.view`, named `debug:…`) and
"debug" on a script (`scripts.action`).

The adapter lies in `vendor/js-debug` AS RELEASED, with no edits; where it came from,
which version it is and what its checksum is are in `vendor/js-debug.json`. It is not on
npm, and the editor brings its own tools along, so it lives in the repository.

To update the adapter: download `js-debug-dap-v<version>.tar.gz` from
`microsoft/vscode-js-debug`'s releases, unpack it in place of `vendor/js-debug`, rewrite
`vendor/js-debug.json` (the version, the address, `shasum -a 256`) and run
`pnpm --filter @mosetta/ide-plugin-debug test` — the tests go to the real adapter and
guard the undocumented parts (`__workspaceFolder`).
