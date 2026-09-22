# Markdown

**`@mosetta/ide-plugin-markdown`** · Markdown rendered next to its source, updated as you type.

## What it does

A Markdown file opens in three modes, switched from the panel's header or with one
command that cycles through them: the text alone, the text and the rendering side by
side, or the rendering alone. The rendering follows the text as you type — unsaved edits
included — with code blocks highlighted the same way as in the editor, tables, lists,
links and images from the project.

The header also counts the words.

### Keys

| Command | macOS | Windows and Linux |
|---|---|---|
| `markdown.mode` — text → both → view | — | — |

Bind a key to it in the `keymap` section if you switch often.

## Screenshots and demos

![A README with its rendering side by side](https://ide.mosetta.org/media/markdown/shot.png)

[Try it in the browser](https://ide.mosetta.org/#demo)

## Using it from another plugin

The plugin is one `file.view` entry that puts the text editor and the rendering side by
side — the example to copy for any view that draws what the user is editing (see the
image viewer's README for the key's shape). The live text, unsaved edits included, is
`getPlugin(DocPlugin).liveText`.
