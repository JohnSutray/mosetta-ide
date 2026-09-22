# Roadmap

What is coming, roughly in order. Nothing here has a date: an item moves up when it
blocks something people are trying to do. Everything below will ship as plugins, like
the rest of the IDE.

## Now — the ground under an open-source project

- **Plugins from npm.** Install a plugin by its package name: into the IDE's own state
  directory, with install scripts disabled, and a clear refusal when it was built for a
  different version of the plugin contract. Plugins also get a way to clean up after
  themselves, so one can be turned off without reloading the tab.
- **A plugins panel.** What is installed, what each plugin does (its README, rendered),
  what it depends on, and a switch to turn it on or off.
- **Split panels.** Any panel split into two to four columns — the oldest promise of the
  layout.
- **A plugin template.** `npm create mosetta-plugin`, and a guide for plugin authors
  built on the contract's JSDoc.
- **Packages and CI.** The `@mosetta/ide-*` packages on npm, tests and type checks on
  macOS, Windows and Linux for every pull request, a contributing guide.

## Next — a web developer's working day

- **Quick fixes and formatting.** Alt+Enter on what the language server offers (add an
  import, remove the unused, fix all), Prettier and ESLint from the project's own
  `node_modules`, on a key or on save.
- **Reading code faster.** Parameter hints, inlay hints, documentation on hover rendered
  as Markdown, a file structure outline, highlighting of the symbol under the caret.
- **Rename with a preview** rather than blindly.
- **Local history.** Every version of a file kept by the daemon, with a diff and a way
  back — for "I deleted that an hour ago" and for a daemon that died.
- **More git.** Blame, a file's history, a commit graph, and rebase or merge conflicts
  settled on the same three-way screen.
- **Tests and runs.** Run a test from its file, a test runner panel, and a list of
  recent runs to repeat, with or without the debugger.
- **More languages.** Ready-made settings for popular language servers beyond
  TypeScript (any LSP server already works when configured by hand).
- **Terminal links.** `path:line` in terminal output opens the file.
- **Settings sync.** The settings directory as a git repository, pulled and pushed from
  the settings window, with per-machine differences in their own file.

## Later — the bigger bets

- **AI as a plugin, like everything else.** The places for it already exist: completion
  sources are an open registry key, so an AI completion source sits next to the
  built-in ones; agents already work in Mosetta's real terminals; and an agent's edits
  can be reviewed with the same diff and shelf you use for your own. The IDE's index
  and symbols make ready-made context.
- **A remote daemon.** The interface in your browser, the daemon on a development
  machine or in a container — with authentication and TLS. This is what will make "runs
  where your browser runs" true without any footnote.
- **Embedding.** The IDE already mounts into any element on a page; playgrounds and
  interactive documentation are the obvious uses.
- **A plugin catalogue** to discover plugins, not only install them by name.
- **Debugging beyond JavaScript** through other DAP adapters.

Have a use case that is not here? Open an issue — the order above is decided by what
people actually need.
