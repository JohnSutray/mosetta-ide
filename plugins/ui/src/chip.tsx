import type { ComponentChildren, JSX } from 'preact';

/**
 * A chip is one widget for the whole IDE.
 *
 * It was born in the project search, and "search everywhere" set up a second one by eye
 * — and they drifted: one had a border, a 4-pixel radius and a height of 20, the other
 * a pill with a radius of 10 and a different font. It showed at first glance: the
 * search-everywhere chips do not look like the square full-text ones. Two elements with
 * the same meaning and different looks are not style but sloppiness, so the chip moved
 * here, to the other widgets.
 *
 * The meaning of the signs travels with the form, otherwise that drifts too:
 *
 * * the COLOUR speaks of being enabled: blue works, grey does not;
 * * the STRIKETHROUGH speaks of the ROW's meaning ("I will not be in the results") rather than of the chip's state, and it is applied to the whole row;
 * * the cross exists only where a chip can be removed for good.
 */
export function Chip({
  on,
  title,
  icon,
  keep,
  onToggle,
  onRemove,
  children,
}: {
  /** Whether it is enabled: the colour is read before the caption. */
  on: boolean;
  /** Our own tooltip — we do not take the native `title`. */
  title?: string;
  /** The icon on the left: the kind is recognised before the caption is read. */
  icon?: ComponentChildren;
  /** Do not lose the caret in the field to a click on a chip. */
  keep?: boolean;
  onToggle: () => void;
  /** Present means we draw a cross: "remove for good" rather than "disable". */
  onRemove?: () => void;
  children: ComponentChildren;
}): JSX.Element {
  const hold = keep === false ? undefined : (event: Event) => event.preventDefault();
  return (
    <span class={`ui-chip ${on ? 'is-on' : 'is-off'}`} title={title}>
      <button type="button" class="ui-chip-name" onMouseDown={hold} onClick={onToggle}>
        {icon ? <span class="ui-chip-icon">{icon}</span> : null}
        {children}
      </button>
      {onRemove ? (
        <button type="button" class="ui-chip-close" onMouseDown={hold} onClick={onRemove}>
          ×
        </button>
      ) : null}
    </span>
  );
}

/**
 * A row of chips. A row is not just a flexbox: it carries the strikethrough and the
 * shared gap, and without it every row's owner would set those up again, slightly their
 * own way.
 */
export function ChipRow({
  struck,
  class: extra,
  keys,
  children,
}: {
  /** An exclusions row: struck through ENTIRELY, whatever state its chips are in. */
  struck?: boolean;
  class?: string;
  /** The row's key surface, if it has keys of its own. */
  keys?: string;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <div
      class={`ui-chips ${struck ? 'is-excluding' : ''} ${extra ?? ''}`}
      data-keys={keys}
    >
      {children}
    </div>
  );
}

/**
 * A tag marks a hit rather than toggling it.
 *
 * It differs from a chip not in decoration but in its promise: a chip is PRESSED, a tag
 * is read. So it has neither a button's backing nor a cross, and it does not take focus
 * — only what is interactive should look interactive.
 *
 * The colour is COMPUTED from the word itself rather than chosen: the set of tags is
 * open (plugins bring them), and a table of colours would be out of date on the first
 * new tag. One word always means one colour, so `function` is recognised by colour
 * before it is read. This does not contradict "colour lives in the palette": the
 * palette holds the CHOICE of a colour, whereas here there is a rule, and it lives in
 * one place — this one.
 */
export function Tag({ name }: { name: string }): JSX.Element {
  const hue = hueOf(name);
  return (
    <span
      class="ui-tag"
      style={{ color: `hsl(${hue} 52% 70%)`, background: `hsl(${hue} 52% 70% / 0.15)` }}
    >
      {name}
    </span>
  );
}

/**
 * A hue from a word. An ordinary string hash taken modulo the circle: what we need is
 * not randomness but CONSTANCY — one word, one colour, in this session and the next.
 */
function hueOf(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}
