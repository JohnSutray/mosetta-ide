import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { DebugMarks, setBreakpoints, setExecution } from '../src/marks.js';

/**
 * The breakpoints in the editor are POSITIONS rather than numbers: an edit above moves
 * a breakpoint along with the code, like the git strips. CodeMirror's state fields are
 * checked with no screen: `EditorState` lives in Node too.
 */
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

describe('the breakpoints in the editor', () => {
  it('they are set by number and read back', () => {
    const { marks, state } = stand();
    const next = state.update({ effects: setBreakpoints.of([{ line: 2, verified: true }, { line: 4, verified: false }]) }).state;
    expect(marks.lines(next)).toEqual([2, 4]);
  });

  it('they travel with the text: a line inserted above shifts a breakpoint', () => {
    const { marks, state } = stand();
    const placed = state.update({ effects: setBreakpoints.of([{ line: 3, verified: true }]) }).state;
    const edited = placed.update({ changes: { from: 0, insert: 'new\n' } }).state;
    expect(marks.lines(edited)).toEqual([4]);
  });

  it('the text was replaced whole — a breakpoint finds its line by the anchor', () => {
    const marks = new DebugMarks({
      attached: () => undefined,
      toggled: () => undefined,
      menu: () => undefined,
      moved: () => undefined,
    });
    const state = EditorState.create({ doc: 'a\nreturn value;\nc\n', extensions: marks.extension() });
    const placed = state.update({
      effects: setBreakpoints.of([{ line: 2, verified: true, anchor: 'return value;' }]),
    }).state;
    const reread = placed.update({
      changes: { from: 0, to: placed.doc.length, insert: 'header\nmore\na\n  return value;\nc\n' },
    }).state;
    expect(marks.lines(reread)).toEqual([4]);
    expect(marks.asks(reread)).toEqual([{ line: 4, anchor: 'return value;' }]);
  });

  it('there is no anchor (an old entry) — the breakpoint stays on its number', () => {
    const marks = new DebugMarks({
      attached: () => undefined,
      toggled: () => undefined,
      menu: () => undefined,
      moved: () => undefined,
    });
    const state = EditorState.create({ doc: 'a\nb\nc\n', extensions: marks.extension() });
    const placed = state.update({ effects: setBreakpoints.of([{ line: 2, verified: true }]) }).state;
    const reread = placed.update({ changes: { from: 0, to: placed.doc.length, insert: 'x\ny\nz\n' } }).state;
    expect(marks.lines(reread)).toEqual([2]);
  });

  it('a breakpoint on a deleted line disappears rather than sticking to the neighbouring one', () => {
    const { marks, state } = stand();
    const placed = state.update({ effects: setBreakpoints.of([{ line: 2, verified: true }]) }).state;
    const edited = placed.update({ changes: { from: 2, to: 4, insert: '' } }).state;
    expect(marks.lines(edited)).toEqual([]);
  });

  it('a number beyond the end of the file is not set at all', () => {
    const { marks, state } = stand();
    const next = state.update({ effects: setBreakpoints.of([{ line: 99, verified: false }]) }).state;
    expect(marks.lines(next)).toEqual([]);
  });

  it('the line being executed is a position too, and is taken off with null', () => {
    const { state } = stand();
    const on = state.update({ effects: setExecution.of(3) }).state;
    const moved = on.update({ changes: { from: 0, insert: 'x\n' } }).state;
    const off = moved.update({ effects: setExecution.of(null) }).state;
    expect(off.doc.lines).toBe(6);
  });
});

describe('the conditions travel with the breakpoint', () => {
  it('a request is kept in the mark and comes back with the new line number', () => {
    const { marks, state } = stand();
    const placed = state.update({
      effects: setBreakpoints.of([{ line: 2, verified: true, condition: 'n === 3', logMessage: 'hi {n}' }]),
    }).state;
    const edited = placed.update({ changes: { from: 0, insert: 'new\n' } }).state;
    expect(marks.asks(edited)).toEqual([{ line: 3, anchor: 'b', condition: 'n === 3', logMessage: 'hi {n}' }]);
  });
});
