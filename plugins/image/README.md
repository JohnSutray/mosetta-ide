# Image viewer

**`@mosetta/ide-plugin-image`** · Images shown as images, and SVG shown as a picture next to its source.

## What it does

Open a PNG, JPEG, GIF, WebP, AVIF, BMP or icon and it is shown as a picture, not as "this file is
not text": fitted to the panel or at its real size, on a checkerboard, dark or light
ground to see transparency. The bytes are fetched only when you open the file, and a
huge one is capped rather than dragged into the tab whole.

An SVG is both a picture and text, so it opens as both: the source in the editor and the
rendering beside it, redrawn as you type.

## Screenshots and demos

![An SVG with its source and the rendering side by side](https://ide.mosetta.org/media/image/shot.png)

[Try it in the browser](https://ide.mosetta.org/#demo)

## Using it from another plugin

The viewer is two entries in the editor's `file.view` key — one for raster images (no
text needed), one for SVG (text needed, editor inside). Any file type can get a view of
its own the same way:

```ts
this.ide.registry('file.view').add({
  id: 'csv',
  opens: (path: string) => path.endsWith('.csv'),
  view: (file: { path: string; text: string }, editor: () => unknown) => (
    <div class="csv-split">
      {editor()}
      <CsvTable text={file.text} />
    </div>
  ),
});
```

For a file with no text, set `text: false` and fetch its bytes when the view appears:
`await this.ide.fs.bytes(path, limit)` returns base64 and says whether it was truncated.
