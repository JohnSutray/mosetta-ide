import { describe, expect, it } from 'vitest';
import { FrameDecoder } from '../src/codec.js';

describe('кадры LSP', () => {
  it('русский текст считается байтами и собирается из кусков', () => {
    const decoder = new FrameDecoder();
    const frame = decoder.encodeFrame({ message: 'сорок два' });
    const half = Math.floor(frame.length / 2);
    expect(decoder.push(frame.subarray(0, half))).toEqual([]);
    expect(decoder.push(frame.subarray(half))).toEqual([{ message: 'сорок два' }]);
  });

  it('два кадра в одном куске — два сообщения', () => {
    const decoder = new FrameDecoder();
    const both = Buffer.concat([decoder.encodeFrame({ a: 1 }), decoder.encodeFrame({ b: 2 })]);
    expect(decoder.push(both)).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
