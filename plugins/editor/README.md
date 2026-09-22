# Editor

**`@mosetta/ide-plugin-editor`** · The panel in the middle: CodeMirror 6 with git strips, diagnostics and hovers, and the empty pasture.

## What it does

The editor shows the open file in the middle column. It is CodeMirror 6 with the IDE's
code look, and it does not decide much by itself: what a file is and whether it is saved
belongs to the Documents plugin, the colours to the theme, the squiggles to the language
servers, the strips beside the lines to git. The editor is where all of that meets.

- **Git strips** beside changed lines; click one to see what was there and put it back.
- **Diagnostics** underlined in the text, with the message on hover.
- **Hovers** gathered from every plugin that has something to say about a spot.
- **Go to definition**, or the list of usages when you are already on the definition.
- **Line editing**: duplicate, delete, move up and down, toggle a comment, several
  carets.
- **Other views for other files**: an image or a Markdown file can be shown by a
  neighbour instead of the text, and an empty editor is filled by whoever asked — the
  pixel sheep, by default.

### Keys

| Command | macOS | Windows and Linux |
|---|---|---|
| `panel.editor` — show or hide the editor | Cmd+8 | Ctrl+Alt+8 (browser), Ctrl+8 (desktop) |
| `symbol.goto` — definition, or usages | Cmd+B | Ctrl+B |
| `edit.duplicateLine` | Cmd+D | Ctrl+D |
| `edit.deleteLine` | Cmd+Y | Ctrl+Y |
| `edit.toggleComment` | Cmd+/ | Ctrl+/ |
| `edit.moveLineUp` / `edit.moveLineDown` | Option+Shift+↑ / ↓ | Ctrl+Shift+↑ / ↓ |
| `edit.addCursorAbove` / `edit.addCursorBelow` | Option+↑ / ↓ | Ctrl+↑ / ↓ |
| `edit.undo` / `edit.redo` | Cmd+Z / Cmd+Shift+Z | Ctrl+Z / Ctrl+Shift+Z |

### Settings

Section `editor` in `settings.json`:

| Key | Default | What it does |
|---|---|---|
| `fontFamily` | `JetBrains Mono` | The code font. |
| `fontSize` | `13` | In pixels. |
| `tabSize` | `2` | Columns per indent level. |
| `lineNumbers` | `true` | Show the gutter with line numbers. |
| `caretWidth` | `2` | The caret's width in pixels. |
| `ligatures` | `false` | Font ligatures in code. |

## Screenshots and demos

![A TypeScript file with git strips and a warning](https://ide.mosetta.org/media/editor/shot.png)

![Editing: a line duplicated, moved and commented, the git strip following along](https://ide.mosetta.org/media/editor/demo.gif)

[Watch the video](https://ide.mosetta.org/media/editor/demo.mp4) · [Try it in the browser](https://ide.mosetta.org/#demo)

## Using it from another plugin

The editor declares four registry keys, and that is how almost everything gets into it.

| Key | What an entry is |
|---|---|
| `editor.extension` | `id` and a CodeMirror `extension`. Find and completion come in this way. |
| `editor.hover` | `id` and `hover(spot)` returning `{ code }` or `null`. The spot has `path`, `line`, `character` and the `text` under the pointer. |
| `file.view` | `id`, `opens(path)`, and `view(file, editor)` — draw the file yourself; call `editor()` to put the text editor inside your view (the Markdown split does). Set `text: false` for files with no text, such as images. |
| `editor.empty` | `id` and a `view` for an editor with nothing open. |

A CodeMirror extension, added from your plugin:

```ts
import { EditorView } from '@codemirror/view';

this.ide.registry('editor.extension').add({
  id: 'notes.trailing',
  extension: EditorView.decorations.of(trailingWhitespace),
});
```

`@codemirror/*` and `preact` are shared: your plugin gets the IDE's own copy, so an
extension built in your package works in the editor.

A hover of your own, next to the language server's:

```ts
this.ide.registry('editor.hover').add({
  id: 'notes.hover',
  hover: async ({ path, line }) => {
    const note = this.notes.at(path, line);
    return note ? { code: note.text } : null;
  },
});
```

The editor instance also takes a few listeners. There is exactly one listener of each
kind, so these are for the plugins that own the job:

```ts
import Editor from '@mosetta/ide-plugin-editor';

const editor = this.ide.getPlugin(Editor);
editor.onCaret((path, line, character) => this.remember(path, line, character));
```

| Method | What it is for |
|---|---|
| `onCaret(handler)` | The caret moved. Caret history listens here. |
| `onSymbolAsk(handler)` | Go-to-definition was asked at a spot. The Symbols plugin answers. |
| `setHead(path, text)` | The file's text in the last commit, to draw the git strips from. |
| `onHunk(handler)` | A git strip was clicked. |
