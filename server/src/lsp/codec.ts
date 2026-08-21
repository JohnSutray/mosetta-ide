
export function encodeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
  return Buffer.concat([header, body]);
}

export class FrameDecoder {
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
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
}
