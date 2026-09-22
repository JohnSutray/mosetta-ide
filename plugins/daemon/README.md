# Daemon memory

**`@mosetta/ide-plugin-daemon`** · How much memory the daemon holds, and how much everything it started holds — on the toolbar.

## What it does

A chip on the toolbar with two numbers: the daemon's own memory, and the memory of what
it started — language servers, terminals, the debugger. They are shown apart on purpose:
"how much does the IDE cost" and "how much does what it runs cost" are different
questions, and a TypeScript server alone can hold a gigabyte. The tooltip explains, and
a click opens the setting that hides the chip.

The numbers come from the heartbeat the tab exchanges with the daemon anyway, so the
chip costs nothing extra.

### Settings

Section `daemon` in `settings.json`:

| Key | Default | What it does |
|---|---|---|
| `memory` | `true` | Show the chip. |

## Screenshots and demos

![The memory chip on the toolbar](https://ide.mosetta.org/media/daemon/shot.png)

[Try it in the browser](https://ide.mosetta.org/#demo)

## Using it from another plugin

The numbers are a core signal, available to any plugin without this one:

```ts
const memory = this.ide.daemon.value; // { rssMb, kidsMb } or null when not known yet
```

`kidsMb` is `null` on systems where a process tree cannot be measured — "we do not know"
rather than zero.
