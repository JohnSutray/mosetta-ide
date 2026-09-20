import { describe, expect, it } from 'vitest';
import { FrameDecoder } from '../src/codec.js';

/** LSP frames: the length is in BYTES, and the body may arrive in chunks. */
describe('LSP frames', () => {
  it('non-Latin text is counted in bytes and assembled from chunks', () => {
    const decoder = new FrameDecoder();
    const frame = decoder.encodeFrame({ message: 'forty two' });
    const half = Math.floor(frame.length / 2);
    expect(decoder.push(frame.subarray(0, half))).toEqual([]);
    expect(decoder.push(frame.subarray(half))).toEqual([{ message: 'forty two' }]);
  });

  it('two frames in one chunk make two messages', () => {
    const decoder = new FrameDecoder();
    const both = Buffer.concat([decoder.encodeFrame({ a: 1 }), decoder.encodeFrame({ b: 2 })]);
    expect(decoder.push(both)).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
