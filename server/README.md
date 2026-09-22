# Daemon

**`@mosetta/ide-server`** · The Mosetta IDE daemon: workspaces, the three filesystem layers, config, processes and the plugin host.

## What it does

The half of the IDE that runs on your machine. It holds every open project in memory —
files, unsaved edits, the file tree — behind three layers with dependencies strictly
downwards: the OS layer (the only code that touches `node:fs`), the memory layer (the
truth for the editor) and derived layers such as the search index. It keeps terminals,
language servers and the debugger alive across tabs, builds plugins from their
TypeScript sources with esbuild, and talks to tabs over one WebSocket on `127.0.0.1`.

You do not usually install it directly: `npx @mosetta/ide` runs it. From a checkout,
`pnpm dev` starts it next to Vite.

| Variable | What it does |
|---|---|
| `IDE_PORT` | The port (default 4177). |
| `IDE_CONFIG_DIR` | Where `settings.json` lives (default `~/.mosetta/ide/config`). |
| `IDE_STATE_DIR` | Where project history and plugin state live (default `~/.mosetta/ide/state`). |
| `IDE_STATIC_DIR` | A built client to serve from the same port. |
| `IDE_CLIENT_DIR` | Where `preact` and CodeMirror resolve from when plugins are built. |

## Screenshots and demos

The daemon has no interface of its own — [try the IDE in the browser](https://ide.mosetta.org/#demo).

## Using it from another plugin

A plugin's server half is loaded by this daemon and written against
[`@mosetta/ide-api/server`](https://www.npmjs.com/package/@mosetta/ide-api): commands the
tab calls with `@remote`, the project with its memory and processes, and events back to
the tabs. The protocol between the daemon and a tab is
[`@mosetta/ide-protocol`](https://www.npmjs.com/package/@mosetta/ide-protocol).
