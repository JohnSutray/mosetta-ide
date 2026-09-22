# Toolbar

**`@mosetta/ide-plugin-toolbar`** · The strip on top: a button for every panel, and chips that report state.

## What it does

Every panel can be reached from the toolbar, and a button shows the state of what it
opens: filled with a rounded square underneath when the panel is open. On the right sit
chips — the connection to the daemon, the language server's progress, the running
terminals, the package manager in use, the daemon's memory.

A button does not know what it does. It calls a command by its id, exactly as a key
does, so a button and a shortcut can never drift apart. And the toolbar is itself a
plugin: the core never heard of it. Turn it off in `settings.json` and every panel is
still one key away.

### Settings

Section `toolbar` in `settings.json`:

| Key | Default | What it does |
|---|---|---|
| `order` | `panel.tree`, `search.everywhere`, `git.branches`, `git.push`, `panel.problems`, `terminal.create`, `projects.show`, `panel.editor`, `keys.show`, `tree.follow`, `panel.changes` | The order of the buttons, by command id. A button missing from the list goes to the end. |

## Screenshots and demos

![The toolbar: panel buttons on the left, state chips on the right](https://ide.mosetta.org/media/toolbar/shot.png)

[Try it in the browser](https://ide.mosetta.org/#demo)

## Using it from another plugin

The toolbar declares two registry keys. Add entries to them; do not import the toolbar.

| Key | What an entry is |
|---|---|
| `toolbar.button` | `id`, a dictionary key for the `title`, the `command` to run, an `icon(filled)`, and optionally `active` (a signal: draw it filled), `visible` and `badge` (a number). |
| `toolbar.widget` | `id`, a `side` (`left` or `right`), and either a `view` or a `chip()` that returns a chip, a list of chips or `null`. A chip has an `icon`, `text`, a `tip`, and optionally `keys`, `tone` (`plain`, `warn`, `bad`), `busy` and `onClick`. |

A button that toggles your panel, drawn filled while the panel is open:

```ts
this.ide.registry('toolbar.button').add({
  id: 'notes',
  title: 'toolbar.notes',
  command: 'panel.notes',
  icon: (filled: boolean) => <NotesIcon filled={filled} />,
  active: this.open,
});
```

A chip on the right that reports something and can be clicked:

```ts
this.ide.registry('toolbar.widget').add({
  id: 'notes.count',
  side: 'right',
  chip: () =>
    this.count.value === 0
      ? null
      : {
          icon: <NotesIcon filled={false} />,
          text: String(this.count.value),
          tip: this.ide.t('notes.tip'),
          onClick: () => this.ide.runCommand('panel.notes'),
        },
});
```

Returning `null` hides the chip; the toolbar re-reads it whenever a signal it read changes.
