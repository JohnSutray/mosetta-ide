# Mosetta IDE

A code editor written from scratch: a Preact + CodeMirror 6 front end, a Node back end,
one WebSocket between them carrying JSON-RPC, and everything above the core — the editor,
the tree, the terminal, git, the debugger — living in plugins.

It runs in a browser tab and it runs as a desktop application. Both use the same front
end and the same back end; the shell adds windows, a tray icon and a supervisor over the
daemon.

```
npx @mosetta/ide install
```

The package ships no built code on purpose: `install` copies the tree into
`~/.mosetta/ide/app/<version>`, builds the IDE there, points `current` at it and lays out
a shortcut for the OS.

## What is in it

- **Editor** — CodeMirror 6, Darcula, highlighting by extension, git strips beside the
  lines, completion with its own list and ranking, find and replace in a file.
- **Language servers** — LSP, started when the project opens rather than at the first
  `.ts` file. `typescript-language-server` is brought along with the editor, so a fresh
  installation has one without installing anything else.
- **Debugger** — DAP through a vendored `vscode-js-debug`: breakpoints that remember the
  line they stand on rather than its number, conditions, hit counts, logpoints,
  exceptions, a tree of sessions per process, and a browser opened under the debugger
  when the program prints an address.
- **Terminals** — a real console under xterm.js, so TUI programs work and Ctrl+C
  interrupts. They are children of the daemon, so they survive a reload of the tab.
- **git** — branches, the outgoing diff, a changes panel with changelists, a shelf of
  patches kept outside git, three-way merging, and a diff that covers the editor in two
  columns or as one ribbon.
- **Search everywhere** — Shift+Shift over a shared marketplace of sources: files,
  symbols, terminals, settings, recent files, with typed tags (`ts function fit`).
- **Views** — images, SVG and Markdown are shown as themselves, with a switch between
  text, text-and-view and view.
- **Settings and keys** — one JSON file per machine and one per project, edited by hand
  or through the settings window; the keymap is an ordinary settings section with an
  editor of its own.

## Running it from a checkout

```
pnpm install
pnpm dev          # the server and Vite; open the printed URL
pnpm desktop      # build in place and start the Electron shell
pnpm test         # every package's tests
pnpm typecheck
pnpm test:e2e     # the keymap pressed through a real Chrome (slow, skipped without one)
```

## How it is put together

```
protocol/     the wire: the shape of every RPC method and event
server/       the daemon: the workspace, three filesystem layers, the config, processes
client/       the core: the wire, the session, the plugin operator, the frame
plugins/api/  the contract plugins are written against
plugins/*     everything else — the editor, the tree, the terminal, git, the debugger…
desktop/      the Electron shell: the supervisor, the windows, the installer
e2e/          checks with a real browser
```

Two processes rather than one, so that the boundary between the UI and the back end is
physical: the front end has no `fs`, and anything it needs has to exist in the protocol.
The back end is also the daemon, so terminals and language servers outlive a tab.

A few rules the codebase rests on:

- **Everything project-scoped lives in a workspace.** There is no module-level variable
  on the server that depends on the project. Several projects side by side means several
  tabs; changing the project changes where the truth is read from.
- **Three filesystem layers, dependencies strictly downwards.** The OS layer is the only
  one allowed to touch `node:fs`; the RAM layer is the truth for the editor and knows
  about unsaved edits; the index lives on events from the RAM layer. A test parses the
  imports and fails on a forbidden arrow.
- **The core knows nothing about the interface.** Delete every plugin and the core still
  comes up, attaches to a project and says who was supposed to draw. Panels, the toolbar,
  the layout, the theme, the notifications and the keyboard all arrive as plugins.
- **Keys are data.** One module listens to the keyboard; everything else registers
  commands by id. A binding says which environments it does not work in, and why — a key
  the browser or the OS has taken is written down with its thief.
- **Settings are a file, defaults are code.** The plugin that reads a section declares it,
  along with the shape of its value, so a bad line in the file is dropped by name rather
  than taking the editor down with it.

## Status

A personal editor, written in the open. It is used daily by its author on macOS, Windows
and Linux, in the browser and in the shell — which is not the same thing as being ready
for you. Expect sharp edges, and expect the keymap to assume a keyboard whose modifiers
have been rearranged.

## Licence

MIT. See [LICENSE](LICENSE).
