import type { KeysEcho } from './echo.js';
import type { KeyBinding, KeyContext, KeyScope, Keymap } from './types.js';
import { keyHost } from './host.js';
import { reserved } from './reserved.js';
import type { Mount } from '@mosetta/ide-api/client';

/** The chain of the focus's contexts, our own first. */
export type ContextResolver = () => readonly KeyContext[];

/**
 * The commands the SYSTEM clipboard calls rather than we. We recognise them by the
 * command rather than by the spelling of the key: on Windows the clipboard and the main
 * modifier are one and the same Control.
 */
const CLIPBOARD = new Set<string>(['tree.copy', 'tree.cut', 'tree.paste']);

/**
 * Surfaces that SWALLOW other people's keys.
 *
 * While the "Keys" window is open a press is the question "what does this key do"
 * rather than an order. Ctrl+1 in it used to honestly show the echo and tug at the
 * project tree behind it at the same time: the instrument keys are checked with was
 * itself changing the editor's state on every check.
 *
 * Only what found a command is swallowed. A key with no command is left to the browser
 * — otherwise the list would stop scrolling with the arrows.
 */
const CAPTURING = new Set<KeyContext>(['keys', 'keymap-edit']);

/**
 * Surfaces that own ALL the keys.
 *
 * The terminal is not our widget but somebody else's program underneath it: Tab
 * completes a path there, Ctrl+C interrupts, Enter sends the line. A global binding has
 * no right to intercept any of that, and the protocol has said so from the very
 * beginning — but until now it stayed a promise: the global keys worked there too. Tab,
 * which we had taken for ourselves, noticed it first.
 *
 * It works the other way round to `CAPTURING`: there we run our own and swallow other
 * people's, here we run our own and DO NOT LOOK at other people's at all.
 */
const OWNING = new Set<KeyContext>(['terminal']);

/**
 * Keys that must NOT be complained about: they are handled by the editor's input
 * mechanics rather than by the layout.
 */

const TAKEN = reserved.in(keyHost.scopes);

/**
 * The "the field itself" command: a layout row with the `editable` context says that
 * the field keeps this chord for itself — undo, the caret by words, the edge of a line.
 * The dispatcher neither runs it nor swallows it: the browser does its own thing. The
 * list is data, and it is visible in the keys window like everything else.
 */
const NATIVE = 'field.native';

/**
 * Keys the browser makes its own only "by default" and gives up on `preventDefault`. We
 * have taken them — which means they have to be swallowed EVERYWHERE rather than only
 * where we assigned a command.
 *
 * Otherwise it turns into a trap: Cmd+← in the editor travels by words, while Cmd+← in
 * the tree goes back through the TAB's history and carries off the whole session with
 * it. A key that works in one panel and fires in the next is worse than an unassigned
 * one.
 */
const SOFT_TAKEN = new Set(TAKEN.filter((item) => item.soft).map((item) => item.key));

/**
 * Left to the browser — the same table, only NOT its soft rows. Two different cases
 * that behave alike: no swallowing needed.
 *
 * Cmd+T does not reach us anyway — the event never gets to the page, and
 * `preventDefault` there is an empty gesture. Cmd+R does reach us, and swallowing that
 * is exactly what must NOT be done: while there is no shell, reloading the tab is the
 * only way to bring the IDE back up after a bad edit. The way out is not taken away.
 */
const LEFT_ALONE = new Set(TAKEN.filter((item) => !item.soft).map((item) => item.key));

/** The modifiers a chord with which counts as an address to us. */
const OURS = ['meta', 'control', 'alt'];

interface Foreign {
  soft?: ReadonlySet<string>;
  left?: ReadonlySet<string>;
}

/**
 * A key is called by its CELL on the keyboard rather than by the character printed on
 * it.
 *
 * This is the same rule by which the main modifier is "the one in the bottom left
 * corner", simply carried through to every key. The character lies in three cases at
 * once, and all three are live:
 *
 * - the layout: in Cyrillic the S key prints «ы», and `mod+s` would match nothing —
 * saving stopped working when the language was switched;
 *
 * - Option: with it `event.key` is already an ASSEMBLED character, Option+2 arrives as
 * `™` and Option+3 as `£`;
 *
 * - the key under Escape: `` ` `` in Latin, «ё» in Cyrillic.
 *
 * `code` depends on none of that: it names the physical place.
 */
function mainFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!.toLowerCase();
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1]!;
  if (code === 'NumpadEnter') return 'enter';
  if (/^(Control|Shift|Alt|Meta)(Left|Right)$/.test(code)) return null;
  return code.toLowerCase();
}

/**
 * A fallback path by character, for when `code` is empty. That is how events from
 * automation and from some on-screen keyboards arrive; losing the key under Escape on
 * them would be a shame.
 */
const BY_CHAR: Record<string, string> = {
  '`': 'backquote',
  '~': 'backquote',
  ё: 'backquote',
  Ё: 'backquote',
  '/': 'slash',
  '?': 'slash',
};

/** Modifiers whose double press can be a key in its own right. */
const BARE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
/** How many milliseconds between presses counts as "in a row". */
const DOUBLE_TAP_MS = 400;

/**
 * The keyboard's rules.
 *
 * Pure questions about a key: does this row apply here, does this surface catch
 * presses, is the chord to be swallowed, is a miss to be complained about, what does a
 * browser event turn into. They have no state of their own and used to be kept as a
 * scattering of functions — while the dispatcher, the mouse, the cheat sheet and four
 * tests all ask them.
 */
export class KeyRules {
  /**
   * The keys of the editor's input mechanics: we do not complain about them and do not
   * swallow them. They are announced by the EDITOR as a contribution to the
   * `keys.mechanics` key rather than by an import from the code display: the input
   * mechanics are its own, the layout merely listens.
   */
  private mechanics: ReadonlySet<string> = new Set();

  useMechanics(keys: ReadonlySet<string>): void {
    this.mechanics = keys;
  }

  /** Whether the row applies in this environment. An empty `where` means everywhere. */
  appliesHere(binding: KeyBinding, scopes: KeyScope[] = keyHost.scopes): boolean {
    if (!binding.where || binding.where.length === 0) return true;
    return binding.where.some((scope) => scopes.includes(scope));
  }

  /**
   * Whether this surface catches other people's keys. The interface asks: a popup with
   * such a surface cannot promise a way out by Escape, because it catches Escape too.
   */
  catchesKeys(context: KeyContext): boolean {
    return CAPTURING.has(context);
  }

  /**
   * Whether to swallow the other consequences of this press.
   *
   * The rule used to be narrower than it was meant to be: only a chord with the MAIN
   * modifier was swallowed, and in the browser on a Mac the main one was Option. Cmd+S
   * is perfectly well swallowed by a prevent, as a check in the console showed:
   * the "Save page as…" window opened not because there was no other way, but because
   * we had never tried.
   *
   * Now ANY chord of ours with meta, control or alt is an address to the editor, and it
   * must have no consequences besides ours. Shift on its own does not count as a
   * modifier here: Shift+arrow is a selection rather than a chord.
   *
   * The exceptions are all named: the clipboard, the input mechanics, and what we
   * deliberately left to the browser.
   */
  swallows(key: string, clip: ReadonlySet<string>, foreign: Foreign = {}): boolean {
    const soft = foreign.soft ?? SOFT_TAKEN;
    const left = foreign.left ?? LEFT_ALONE;
    if (soft.has(key)) return true;
    if (left.has(key)) return false;
    if (clip.has(key)) return false;
    if (this.mechanics.has(key)) return false;
    return key.split('+').some((part) => OURS.includes(part));
  }

  /**
   * Whether to say out loud that the key calls nothing.
   *
   * The rule is now shared with `swallows`: **we complain about exactly what we took**.
   * Since we ate the press and did nothing with it, the silence looks like a breakage,
   * and it is for us to explain it.
   *
   * Hence the silence as well: the clipboard, the input mechanics, a bare key and what
   * is left to the browser are not taken by us — so there is nothing to talk about.
   */
  complains(
    key: string,
    opts: { repeat: boolean; clip: ReadonlySet<string> },
  ): boolean {
    if (opts.repeat) return false;
    return this.swallows(key, opts.clip);
  }

  /**
   * The user is TYPING text into an input field.
   *
   * A rule that runs through everything: an input field owns the keys text is edited
   * with, and no layout overrides them. Without it, Backspace in the project path field
   * called "delete" from the tree — and offered to delete the project root, because the
   * field lies in the same column as the tree.
   *
   * A chord with the main modifier is not text and passes through: Cmd+S is obliged to
   * save even when the caret is in a field. Enter, Escape and the arrows pass through
   * too — lists with a search rest on them, and there the focus is in a field.
   */
  typedIntoField(event: KeyboardEvent): boolean {
    if (!isTextField(event.target)) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const erases = event.key === 'Backspace' || event.key === 'Delete';
    if (event.key.length !== 1 && !erases) return false;
    return !(erases && isEmptyField(event.target));
  }

  /**
   * The focus is in an ordinary input field — an `<input>` or a `<textarea>`. An
   * editable div (CodeMirror) does not count: it keeps its own mechanics and takes its
   * commands from the layout.
   */
  inPlainField(target: EventTarget | null): boolean {
    return isTextField(target) && !isContentEditable(target);
  }

  /**
   * Which layout row answers for the key: our own context first — the whole chain the
   * surface named itself by — then, if the focus is in a field, `editable`, then the
   * global one. An owning surface never gets as far as the global ones.
   */
  pick(
    bindings: readonly KeyBinding[],
    context: KeyContext | readonly KeyContext[],
    key: string,
    editable: boolean,
  ): KeyBinding | undefined {
    const chain: readonly KeyContext[] = typeof context === 'string' ? [context] : context;
    const at = (when: KeyContext) => bindings.find((b) => (b.when ?? 'global') === when && b.key === key);
    for (const one of chain) {
      const found = at(one);
      if (found) return found;
    }
    return (editable ? at('editable') : undefined) ?? (OWNING.has(chain[0] ?? 'global') ? undefined : at('global'));
  }

  /**
   * A browser event → a string of the form `meta+shift+s`. The order of the parts is
   * the same as in the layout, or the strings would not match.
   */
  eventToKey(event: KeyboardEvent): string | null {
    const main = event.code
      ? mainFromCode(event.code)
      : (BY_CHAR[event.key] ?? normalizeMainKey(event.key));
    if (!main) return null;

    const parts: string[] = [];
    if (event.metaKey) parts.push('meta');
    if (event.ctrlKey) parts.push('control');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    parts.push(main);
    return parts.join('+');
  }
}

/** One set per tab. The IDE's root object will become their owner. */
export const keyRules = new KeyRules();

/**
 * The live keyboard listener.
 *
 * A class rather than a closure: it has six state variables — this environment's
 * layout, the clipboard's keys, the held modifier and the rhythm of a double press —
 * and all of them lived inside `installDispatcher`'s closure. There was no looking at
 * them or substituting them from outside, and the double-shift test had to be written
 * through real window events.
 */
export class Dispatcher {
  private bindings: KeyBinding[] = [];
  /** This layout's clipboard chords — we do not complain about those. */
  private clipKeys: ReadonlySet<string> = new Set<string>();

  /**
   * A double Shift. Only a clean rhythm counts: the modifier pressed and released with
   * nothing pressed in between, and then the same again. Otherwise typing capitals
   * would open the search on every word.
   */
  private holding: { key: string; clean: boolean } | null = null;
  private lastTapKey = '';
  private lastTapAt = 0;

  constructor(
    private readonly resolveContext: ContextResolver,
    private readonly onUnbound: (key: string) => void,
    /** The echo of presses: written BEFORE the decision about what to do. */
    private readonly echo: KeysEcho,
    /** Calling a command is a core service: the same thing a button would do. */
    private readonly run: (id: string) => boolean,
    /** The mount point: a page takes the window, an embedded IDE its own root. */
    mount: Pick<Mount, 'listen'>,
  ) {
    this.offs = [
      mount.listen('keydown', this.onKeyDown, { capture: true }),
      mount.listen('keyup', this.onKeyUp, { capture: true }),
    ];
  }

  private readonly offs: Array<() => void>;

  setKeymap(keymap: Keymap): void {
    this.bindings = keymap.bindings.filter((binding) => keyRules.appliesHere(binding));
    this.clipKeys = new Set(
      this.bindings.filter((binding) => CLIPBOARD.has(binding.command)).map((b) => b.key),
    );
  }

  dispose(): void {
    for (const off of this.offs) off();
  }

  /**
   * Which command the surface under the focus is called by. The window frame writes it
   * into `data-command`; the dispatcher no longer reads the stack of windows — that
   * belongs to the widgets, and the layout has no need to know about it.
   */
  private surfaceCommand(): string | undefined {
    if (typeof document === 'undefined') return undefined;
    const here = document.activeElement as HTMLElement | null;
    return here?.closest<HTMLElement>('[data-command]')?.dataset['command'];
  }

  private fire(key: string, event: KeyboardEvent): boolean {
    const chain = this.resolveContext();
    const context = chain[0] ?? 'global';
    const binding = keyRules.pick(this.bindings, chain, key, keyRules.inPlainField(event.target));

    this.echo.echo(key, context, binding?.command ?? null);
    if (binding?.command === NATIVE) return true;
    if (!binding) {
      if (!CAPTURING.has(context) && keyRules.complains(key, { repeat: event.repeat, clip: this.clipKeys })) {
        this.onUnbound(key);
      }
      return false;
    }

    if (
      CAPTURING.has(context) &&
      (binding.when ?? 'global') !== context &&
      binding.command !== this.surfaceCommand()
    ) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    if (this.run(binding.command)) {
      event.preventDefault();
      event.stopPropagation();
    }
    return false;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (isBareModifier(event)) {
      const name = modifierName(event);
      this.holding ??= { key: name, clean: !hasOtherModifier(event, name) };
    } else {
      if (this.holding) this.holding.clean = false;
      this.lastTapAt = 0;
    }

    const key = keyRules.eventToKey(event);
    if (!key || keyRules.typedIntoField(event)) return;
    if (this.fire(key, event)) return;
    if (!event.defaultPrevented && keyRules.swallows(key, this.clipKeys)) event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!isBareModifier(event)) return;
    const name = modifierName(event);
    const pressed = this.holding;
    this.holding = null;
    if (!pressed || pressed.key !== name || !pressed.clean) {
      this.lastTapAt = 0;
      return;
    }

    const now = performance.now();
    if (this.lastTapKey === name && now - this.lastTapAt <= DOUBLE_TAP_MS) {
      this.lastTapAt = 0;
      this.fire(`double:${name}`, event);
      return;
    }
    this.lastTapKey = name;
    this.lastTapAt = now;
  };
}

function isContentEditable(target: EventTarget | null): boolean {
  return Boolean((target as { isContentEditable?: boolean } | null)?.isContentEditable);
}

/** A field with nothing to erase. An editable div is taken to be non-empty. */
function isEmptyField(target: EventTarget | null): boolean {
  const el = target as { value?: string; isContentEditable?: boolean } | null;
  if (!el || el.isContentEditable) return false;
  return typeof el.value === 'string' && el.value === '';
}

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/**
 * A modifier pressed on its own. We look at both `key` and `code`: layouts and
 * automation set them differently, and `code` does not depend on the language either.
 */
function isBareModifier(event: KeyboardEvent): boolean {
  return BARE_MODIFIERS.has(event.key) || /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(event.code);
}

/**
 * `ShiftLeft` and `Shift` are one and the same key as far as a double press is
 * concerned.
 */
function modifierName(event: KeyboardEvent): string {
  if (BARE_MODIFIERS.has(event.key)) return event.key.toLowerCase();
  return event.code.replace(/(Left|Right)$/, '').toLowerCase();
}

/** Whether SOME OTHER modifier besides this one is held at the same time. */
function hasOtherModifier(event: KeyboardEvent, self: string): boolean {
  return (
    (event.shiftKey && self !== 'shift') ||
    (event.ctrlKey && self !== 'control') ||
    (event.altKey && self !== 'alt') ||
    (event.metaKey && self !== 'meta')
  );
}

function normalizeMainKey(key: string): string | null {
  if (!key) return null;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;
  if (key === ' ') return 'space';
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}
