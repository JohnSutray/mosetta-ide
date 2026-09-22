# Notifications

**`@mosetta/ide-plugin-notifications`** · What the IDE has to say, as lines that go away — never as a modal dialog.

## What it does

Messages from the IDE and its plugins appear as a stack of short lines in a corner: an
info line, a warning, an error, or a line for work in progress that turns into its
result when the work is done ("Pushing…" → "Pushed 2 commits"). A line goes away by
itself after a minute, or on a click; nothing blocks the interface or asks you to press
OK.

## Screenshots and demos

![A refused push reported as a line](https://ide.mosetta.org/media/notifications/shot.png)

[Try it in the browser](https://ide.mosetta.org/#demo)

## Using it from another plugin

Notifications are a core service; this plugin only draws them. Every plugin says things
through its own `ide`:

```ts
this.ide.say(this.ide.t('notes.saved'));          // an info line
this.ide.complain(this.ide.t('notes.failed'));    // an error line

const done = this.ide.working(this.ide.t('notes.syncing'));
try {
  await this.sync();
  done(this.ide.t('notes.synced'));
} catch (err) {
  done(String(err), true);                         // the same line turns into an error
}

this.ide.sayOnce('notes.status', this.ide.t('notes.offline')); // one line per slot, replaced rather than repeated
```

Text shown to a person is always a dictionary key, never a literal in code: labels are
data, and a test holds every plugin to it.
