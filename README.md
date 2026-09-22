# Mosetta IDE

**An IDE made of plugins — not an IDE with plugins.**

Mosetta is a code editor built on the web platform. The core is small: it brings plugins
up and connects them to a local daemon. Everything you see — the editor, the file tree,
the terminal, git, the debugger, even the toolbar and the column layout — is a plugin,
and a plugin is an ordinary npm package written in TypeScript and Preact.

It runs in a browser tab and as a desktop app, with the same code in both.

**[Try it in your browser →](https://ide.mosetta.org)** The real client, mounted into the
page, with a daemon the page plays itself. To run it on your own project, see
[running it from a checkout](#running-it-from-a-checkout).

> **Status: early.** Mosetta is used every day on macOS, Windows and Linux, in the
> browser and in the desktop shell — which is not the same as being ready for you. See
> the [roadmap](ROADMAP.md) for what is coming.

## Why Mosetta

- **Made of plugins.** About 80% of the code lives in 31 plugin packages; the core,
  plugin contract included, is around 10,000 lines. Turn the toolbar off with one line
  in `settings.json` and the IDE still starts — and tells you which plugin was supposed
  to draw it.
- **Runs where your browser runs.** The same interface in a browser tab or in the
  Electron shell. Several projects side by side are simply several tabs. Today the
  daemon runs on the same machine; a remote daemon is on the roadmap.
- **Plugins are npm packages.** TypeScript and Preact, a manifest in `package.json`, and
  no build step for the author: the IDE builds a plugin from its sources. Installing
  third-party plugins straight from npm is the next thing on the roadmap.
- **The interface is disposable; your work is not.** Terminals and language servers
  live in a local daemon, so a reloaded tab picks up exactly where it was.
- **No keystroke waits for a process.** Git state and file contents are read from
  memory that is kept current in the background. Twenty git status reads in a row fit
  in 300 ms, and a test holds it to that.
- **An honest interface.** A list cut short says so ("2000 of 2010 files checked"); a
  broken tool says it is broken instead of showing an empty panel.
- **Keys, settings and labels are data.** One JSON file per machine and one per
  project; the settings window writes the same file you edit by hand. A shortcut the
  browser keeps for itself is listed along with the reason.
- **Workflows worth switching for.** Search everywhere with tags, changelists and a
  shelf of patches, a three-way merge screen, a debugger that follows your server into
  the browser.

## Principles

These are the rules the codebase is held to — and the ones a contribution is reviewed
against.

1. **Made of plugins, not with plugins.** If a feature cannot be turned off with one
   line, it lives in the wrong place.
2. **No keystroke waits for an external process.** Anything the interface needs is read
   from memory, and memory is updated by events.
3. **The interface does not lie.** A silent truncation is the worst kind of bug; an
   empty panel always explains itself.
4. **Everything is data.** Keys, settings and labels are files. A second way to edit a
   setting is never a second source of truth.
5. **The interface is disposable, the state lives in the daemon.**
6. **One thing, one way.** A button and a shortcut call the same command; there is one
   way to show code and one diff.
7. **A rule is written as a test, not as a comment.** Layer boundaries, package
   boundaries and the keymap are all guarded by tests.
8. **A web developer can already write a plugin.** TypeScript, Preact, npm and vitest —
   nothing else to learn.
9. **Classic controls.** Mouse and keyboard are equals, with no modes.
10. **The interface has a face.** An empty editor is a pasture of pixel sheep.

Many of Mosetta's answers to hard IDE problems — search everywhere, changelists, the
shelf, a keymap that explains itself — are borrowed from WebStorm and rebuilt on the web
platform.

## What is in it

- **Editor** — CodeMirror 6 with Darcula, git change markers beside the lines, code
  completion with its own ranking, find and replace.
- **Language servers** — LSP started when a project opens; `typescript-language-server`
  ships with the editor, so a fresh install checks TypeScript out of the box.
- **Debugger** — DAP through a vendored `vscode-js-debug`: breakpoints that remember the
  line rather than its number, conditions, logpoints, exceptions, and a browser opened
  under the debugger when your server prints its address.
- **Terminals** — a real console under xterm.js: TUI programs work, Ctrl+C interrupts,
  and terminals survive a reload.
- **Git** — branches, the outgoing diff, changelists, a shelf of patches outside git,
  three-way merging, and a diff that covers the editor in two columns or as one ribbon.
- **Search everywhere** — Shift+Shift over files, symbols, terminals and settings, with
  typed tags (`ts function fit`).
- **Views** — images, SVG and Markdown shown as themselves.
- **Settings and keys** — a settings window over the same JSON file, and a keymap
  editor.

## Writing a plugin

A plugin is a package with an `ide` field in its `package.json`:

```json
{
  "name": "@mosetta/ide-plugin-rerun",
  "type": "module",
  "ide": {
    "client": "src/client.ts",
    "strings": { "en": "src/en.json" }
  }
}
```

and a class. This is the whole of a real one — it re-runs the last npm script, using
another plugin as a typed neighbour:

```ts
import { command, plugin, type Ide } from '@mosetta/ide-api/client';
import NpmScripts from '@mosetta/ide-plugin-npm-scripts';

@plugin({ title: 'plugin.rerun' })
export default class Rerun {
  private last: string | null = null;

  constructor(private readonly ide: Ide) {}

  @command('scripts.rerun')
  protected rerun(): void {
    const npm = this.ide.getPlugin(NpmScripts);
    const id = this.last ?? npm.scripts()[0]?.id ?? null;
    if (!id) return this.ide.say(this.ide.t('rerun.nothing'));
    this.last = id;
    void npm.run(id);
  }
}
```

The command gets a key in the keymap and a button wherever you like; plugins extend
each other through registry keys (`search.source`, `editor.extension`, `panel.action`,
…) rather than by patching one another. A plugin can have a server half too, and
calling it looks like calling a method. In tests a plugin comes up under a fake host
exactly the way it does in the application (`@mosetta/ide-api/testing`).

## Embedding it

The IDE mounts into any element of a page; the website is built that way. For now this
works from a checkout, where the client is the workspace package `@mosetta/ide-client`.

```ts
import { mount } from '@mosetta/ide-client/embed';

const ide = mount(document.querySelector('#ide')!); // talks to the local daemon
ide.commands.run('search.everywhere');
```

Keys and pointer events are listened for on that element, the plugins' styles are fenced
in to it, and the page's title, address and scroll position are left alone. `mount`
takes a `dial` option — anything shaped like a `WebSocket` — which is how the website
runs the IDE with no daemon at all.

## Packages

The plugin contract and every plugin are published on npm under
[`@mosetta/`](https://www.npmjs.com/org/mosetta): start from
[`@mosetta/ide-api`](plugins/api#readme), and each plugin's README says what it does and
how to use it from another plugin. The client and the daemon are not packaged yet; for
now they run from a checkout.

## Running it from a checkout

```
pnpm install
pnpm dev          # the server and Vite; open the printed URL
pnpm desktop      # build in place and start the Electron shell
pnpm test         # every package's tests
pnpm typecheck
pnpm test:e2e     # the keymap pressed through a real Chrome (skipped without one)
```

## How it is put together

```
protocol/     the wire: every RPC method and event
server/       the daemon: workspaces, three filesystem layers, config, processes
client/       the core: the wire, the session, the plugin operator, the frame
plugins/api/  the contract plugins are written against
plugins/*     everything else — the editor, the tree, the terminal, git, the debugger…
desktop/      the Electron shell: the supervisor, the windows, the installer
e2e/          checks with a real browser
site/         ide.mosetta.org: the landing page and the playground
```

The UI and the daemon are two processes on purpose: the front end has no `fs`, so
anything it needs has to exist in the protocol, and the daemon keeps terminals and
language servers alive across tabs.

- **Everything project-scoped lives in a workspace.** Nothing on the server depends on
  "the current project"; several projects side by side are several tabs.
- **Three filesystem layers, dependencies strictly downwards.** Only the OS layer may
  touch `node:fs`; the memory layer is the truth for the editor and knows about unsaved
  edits; the search index lives on memory's events.
- **The core knows nothing about the interface.** Delete every plugin and it still comes
  up, attaches to a project and says who was supposed to draw.

## Contributing

Issues and pull requests are welcome. Before sending a change, run `pnpm test` and
`pnpm typecheck`; code carries no prose comments, but every public declaration has a
JSDoc that says what it does and why. Commits follow
[Conventional Commits](https://www.conventionalcommits.org).

## Licence

MIT. See [LICENSE](LICENSE).
