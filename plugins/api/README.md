# Plugin contract

**`@mosetta/ide-api`** · The types, decorators and fake host every Mosetta plugin is written and tested against.

## What it does

This package is the whole surface a plugin sees. Everything else in the IDE — the
editor, the tree, git — is reached through it, as another plugin. It has four entry
points:

| Import | For |
|---|---|
| `@mosetta/ide-api/client` | The half of a plugin that runs in the tab: decorators, the `Ide` services, Preact context hooks. |
| `@mosetta/ide-api/server` | The half that runs in the daemon: commands, the project, processes. |
| `@mosetta/ide-api/testing` | A fake host that brings plugins up the way the application does. |
| `@mosetta/ide-api/vitest` | A vitest preset for plugin packages. |

A plugin is an npm package with an `ide` field in its `package.json`. The IDE builds it
from its TypeScript sources with esbuild, so there is no build step for the author, and
`preact`, `@preact/signals`, `@codemirror/*` and the other plugins resolve to the
application's own copies.

```json
{
  "name": "mosetta-plugin-notes",
  "type": "module",
  "ide": {
    "client": "src/client.tsx",
    "server": "src/server.ts",
    "strings": { "en": "src/en.json", "ru": "src/ru.json" }
  }
}
```

Both halves are optional: a theme has only a client, an indexer only a server. Labels
are dictionary keys in code and text in the `strings` files; English is required.

## Screenshots and demos

The contract has no interface of its own. Every screenshot in the other packages'
READMEs is something built on it — [try them all in the browser](https://ide.mosetta.org/#demo).

## Using it from another plugin

### The client half

```tsx
import { activate, command, configSection, plugin, remote, stub, type Ide } from '@mosetta/ide-api/client';
import DocPlugin from '@mosetta/ide-plugin-doc';

@configSection({ section: 'notes', defaults: { folder: 'notes' } })
@plugin({ title: 'plugin.notes' })
export default class Notes {
  constructor(private readonly ide: Ide) {}

  @command('notes.today')
  protected async today(): Promise<void> {
    const { path } = await this.create({ day: new Date().toISOString().slice(0, 10) });
    await this.ide.getPlugin(DocPlugin).goTo(path, 0);
  }

  @activate() protected start(): void {
    this.ide.css(`.notes-row { color: var(--fg); }`);
    this.ide.on('changed', () => this.ide.say(this.ide.t('notes.changed')));
  }

  @remote('create') create(_ask: { day: string }): Promise<{ path: string }> {
    return stub();
  }
}
```

| Decorator | Where | What it does |
|---|---|---|
| `@plugin({ title })` | class | The plugin's passport: `title` is a dictionary key. Required. |
| `@command(id)` | method | A command — the same one a key, a button and search everywhere call. |
| `@activate()` | method | Runs once every plugin is constructed and every command registered. |
| `@registry({ key, schema })` | class | Declare a registry key others add entries to; entries are checked against the JSON Schema. |
| `@configSection({ section, defaults, schema?, fields?, editor? })` | class | Own a section of `settings.json`; the settings window shows it. |
| `@remote(name?)` | method | A method of the plugin's server half; the body is `stub()`, the call goes over the wire. |

What `ide` gives a plugin, besides `getPlugin`:

| Member | What it is |
|---|---|
| `registry(key)` | `add(entry)`, and `all` / `entries` as signals. The way plugins extend each other. |
| `getPlugin(Class)` | Another plugin's instance, by its class, fully typed. |
| `remember(key, initial, scope?)` | A signal that survives a reload, stored per plugin. |
| `settingsOf(section, defaults)` | A section's value: factory, then the user's file, then the project's. |
| `setSetting(section, key, value, scope?)` / `resetSetting` | Write a setting the same way the settings window does. |
| `t(key, params?)` | The dictionary. |
| `say`, `complain`, `sayOnce`, `working` | Lines in the notifications. |
| `css(text)` | Your styles, fenced in to the IDE's root. |
| `surface(view)` | Draw something over the panels — a popup, a window. |
| `on(event, handler)` | Events from your own server half. |
| `project`, `workspaces`, `connected`, `daemon` | Signals about the project and the daemon. |
| `docs`, `tree`, `fs` | The wires to the daemon's memory and disk layers. |
| `mount` | Where the IDE is mounted: its size, bounds, and where to listen for events. |
| `runCommand(id)` | Run any command by id. |

`ide.mount.reveal(element)` scrolls an element into view inside its own scrolling box and
never the page around the IDE; use it instead of `scrollIntoView`.

### The server half

```ts
import { activate, command, type CallContext, type Ide } from '@mosetta/ide-api/server';
import fs from 'node:fs/promises';

export default class NotesServer {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.onProject((project) => this.ide.log.info(`notes for ${project.name}`));
  }

  @command() protected async create(params: unknown, call: CallContext): Promise<{ path: string }> {
    const { day } = params as { day: string };
    const { folder } = call.project.settings('notes', { folder: 'notes' });
    const path = `${folder}/${day}.md`;
    await fs.mkdir(call.project.resolve(folder), { recursive: true });
    await fs.writeFile(call.project.resolve(path), `# ${day}\n`, { flag: 'a' });
    call.project.emit('changed', { path });
    return { path };
  }
}
```

A server method gets its params and the calling tab's `project`: `root`, `name`,
`memory` (the files as the editor has them, unsaved edits included), `settings`,
`resolve` (a path inside the project, checked), `emit` (an event to the project's tabs),
`use` (a resource that lives as long as the project), `start` (a long-lived process that
dies with it). The plugin's `ide` adds `run` and `stream` for short processes, `which`,
`environment` (the user's shell environment), `state` (a directory for the plugin's own
data outside the project) and `log`.

### Tests

The fake host brings plugins up exactly as the application does — construct, declare,
register commands, activate — and lets the test answer the server half:

```ts
import { FakeHost } from '@mosetta/ide-api/testing';
import Notes from '../src/client.js';

const host = new FakeHost();
const notes = host.add(Notes, 'mosetta-plugin-notes');
host.ide('mosetta-plugin-notes').answers.set('create', () => ({ path: 'notes/2026-09-22.md' }));
await host.start();

host.run('notes.today');
```

A failure inside `activate` is thrown here instead of being turned into a notification:
in a browser one broken plugin must not take the others down, in a test it must fail
the test.
