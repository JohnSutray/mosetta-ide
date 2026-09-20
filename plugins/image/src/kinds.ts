/**
 * Which files we show as an image — a pure table.
 *
 * By NAME rather than by contents, and that does not contradict the rule elsewhere:
 * there the question is "is this file text or not", and lying there is dangerous — a
 * mistake hides data. Here the question is different: "what do we show it with". A
 * mistake costs one click back, and knowing the extension is enough: `.png` names
 * itself.
 */
export class ImageKinds {
  /** Raster: it does not live in memory and is read as bytes on demand. */
  private readonly raster: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
  };

  /** The file's extension, lower-cased; without the dot and without the path. */
  extension(path: string): string {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
  }

  /** A raster image — the one we show as bytes. */
  isRaster(path: string): boolean {
    return this.extension(path) in this.raster;
  }

  /**
   * SVG is an image MADE OF TEXT, and that is the only difference that matters to us:
   * it can be both shown and edited, and its text is already in memory.
   */
  isSvg(path: string): boolean {
    return this.extension(path) === 'svg';
  }

  /** What to call this to the browser in a `data:` URL. */
  mime(path: string): string {
    return this.raster[this.extension(path)] ?? 'application/octet-stream';
  }

  /** A human-sized figure for the file: bytes read badly, kilobytes read well. */
  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
