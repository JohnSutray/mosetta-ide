import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { DebugMarks, setBreakpoints, setExecution } from '../src/marks.js';

function stand() {
  const heard: Array<Array<{ line: number }>> = [];
  const marks = new DebugMarks({
    attached: () => undefined,
    toggled: () => undefined,
    menu: () => undefined,
    moved: (_view, asks) => heard.push(asks),
  });
  const state = EditorState.create({ doc: 'a\nb\nc\nd\n', extensions: marks.extension() });
  return { marks, state, heard };
}

describe('точки в редакторе', () => {
  it('ставятся по номерам и читаются обратно', () => {
    const { marks, state } = stand();
    const next = state.update({ effects: setBreakpoints.of([{ line: 2, verified: true }, { line: 4, verified: false }]) }).state;
    expect(marks.lines(next)).toEqual([2, 4]);
  });

  it('едут вместе с текстом: строка, вставленная выше, сдвигает точку', () => {
    const { marks, state } = stand();
    const placed = state.update({ effects: setBreakpoints.of([{ line: 3, verified: true }]) }).state;
    const edited = placed.update({ changes: { from: 0, insert: 'new\n' } }).state;
    expect(marks.lines(edited)).toEqual([4]);
  });

  it('точка на удалённой строке пропадает, а не прилипает к соседней', () => {
    const { marks, state } = stand();
    const placed = state.update({ effects: setBreakpoints.of([{ line: 2, verified: true }]) }).state;
    const edited = placed.update({ changes: { from: 2, to: 4, insert: '' } }).state;
    expect(marks.lines(edited)).toEqual([]);
  });

  it('номер за концом файла не ставится вовсе', () => {
    const { marks, state } = stand();
    const next = state.update({ effects: setBreakpoints.of([{ line: 99, verified: false }]) }).state;
    expect(marks.lines(next)).toEqual([]);
  });

  it('строка выполнения — тоже позиция, и снимается null', () => {
    const { state } = stand();
    const on = state.update({ effects: setExecution.of(3) }).state;
    const moved = on.update({ changes: { from: 0, insert: 'x\n' } }).state;
    const off = moved.update({ effects: setExecution.of(null) }).state;
    expect(off.doc.lines).toBe(6);
  });
});

describe('условия едут с точкой', () => {
  it('просьба хранится в метке и возвращается с новым номером строки', () => {
    const { marks, state } = stand();
    const placed = state.update({
      effects: setBreakpoints.of([{ line: 2, verified: true, condition: 'n === 3', logMessage: 'hi {n}' }]),
    }).state;
    const edited = placed.update({ changes: { from: 0, insert: 'new\n' } }).state;
    expect(marks.asks(edited)).toEqual([{ line: 3, condition: 'n === 3', logMessage: 'hi {n}' }]);
  });
});
