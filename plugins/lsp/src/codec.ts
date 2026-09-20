/**
 * LSP frames over stdio: `Content-Length: N\r\n\r\n{json}`.
 *
 * Twenty lines of our own instead of a dependency: the protocol here is trivial, and an
 * extra package in a hot path is not something we need. The one subtlety is that the
 * length is in BYTES rather than characters: non-Latin text in a diagnostic breaks a
 * naive `text.length` instantly.
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /** We feed it chunks of stdout and get parsed messages back. */
  push(chunk: Uint8Array): unknown[] {
    const piece = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    this.buffer = this.buffer.length === 0 ? piece : Buffer.concat([this.buffer, piece]);
    const out: unknown[] = [];

    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) break; 
      const body = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      try {
        out.push(JSON.parse(body));
      } catch {}
    }

    return out;
  }

  encodeFrame(message: unknown): Buffer {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
    return Buffer.concat([header, body]);
  }
}
