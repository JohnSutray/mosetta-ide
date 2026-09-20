import { keyHost } from './host.js';

/** Rows of cells: the `code`, and what is printed on the key. */
const ROWS: Array<Array<[string, string, number?]>> = [
  [
    ['escape', 'esc'],
    ['digit1', '1'],
    ['digit2', '2'],
    ['digit3', '3'],
    ['digit4', '4'],
    ['digit5', '5'],
    ['digit6', '6'],
    ['digit7', '7'],
    ['digit8', '8'],
    ['digit9', '9'],
    ['digit0', '0'],
    ['minus', '-'],
    ['equal', '='],
    ['backspace', '⌫', 2],
  ],
  [
    ['tab', 'tab', 1.5],
    ['q', 'Q'],
    ['w', 'W'],
    ['e', 'E'],
    ['r', 'R'],
    ['t', 'T'],
    ['y', 'Y'],
    ['u', 'U'],
    ['i', 'I'],
    ['o', 'O'],
    ['p', 'P'],
    ['bracketleft', '['],
    ['bracketright', ']'],
    ['backslash', '\\', 1.5],
  ],
  [
    ['capslock', 'caps', 1.8],
    ['a', 'A'],
    ['s', 'S'],
    ['d', 'D'],
    ['f', 'F'],
    ['g', 'G'],
    ['h', 'H'],
    ['j', 'J'],
    ['k', 'K'],
    ['l', 'L'],
    ['semicolon', ';'],
    ['quote', "'"],
    ['enter', '⏎', 2.2],
  ],
  [
    ['shift', 'shift', 2.4],
    ['z', 'Z'],
    ['x', 'X'],
    ['c', 'C'],
    ['v', 'V'],
    ['b', 'B'],
    ['n', 'N'],
    ['m', 'M'],
    ['comma', ','],
    ['period', '.'],
    ['slash', '/'],
    ['arrowup', '↑'],
    ['shift', 'shift', 1.6],
  ],
];

/** The bottom row depends on the system: on a Mac Cmd sits next to the space bar. */
function bottom(isMac: boolean): Array<[string, string, number?]> {
  return isMac
    ? [
        ['control', 'ctrl', 1.4],
        ['alt', 'option', 1.4],
        ['meta', 'cmd', 1.6],
        ['space', 'space', 6],
        ['meta', 'cmd', 1.6],
        ['alt', 'option', 1.4],
        ['arrowleft', '←'],
        ['arrowdown', '↓'],
        ['arrowright', '→'],
      ]
    : [
        ['control', 'ctrl', 1.6],
        ['meta', 'win', 1.4],
        ['alt', 'alt', 1.4],
        ['space', 'space', 6],
        ['alt', 'alt', 1.4],
        ['control', 'ctrl', 1.4],
        ['arrowleft', '←'],
        ['arrowdown', '↓'],
        ['arrowright', '→'],
      ];
}

/**
 * Highlight a chord: `meta+shift+s` → Cmd, Shift and S are held down.
 *
 * A double press (`double:shift`) is a rhythm rather than a chord: we show the same
 * key, and that it is pressed twice is said by the caption above the keyboard.
 */
export function Keyboard({ chord }: { chord: string }) {
  const pressed = new Set(
    chord
      .replace(/^double:/, '')
      .split('+')
      .map((one) => one.trim().toLowerCase())
      .filter(Boolean),
  );
  const rows = [...ROWS, bottom(keyHost.isMac)];
  return (
    <div class="keymap-board">
      {rows.map((row, at) => (
        <div class="keymap-board-row" key={at}>
          {row.map(([code, cap, width], index) => (
            <span
              key={`${code}:${index}`}
              class={`keymap-cap ${pressed.has(code) ? 'is-down' : ''}`}
              style={width ? `flex-grow:${width}` : undefined}
            >
              {cap}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
