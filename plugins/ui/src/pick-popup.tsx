import { useT } from '@mosetta/ide-api/client';
import type { Size } from './windows/geometry.js';
import type { Windows } from './windows/windows.js';
import { Fragment } from 'preact';
import type { ComponentChildren, JSX } from 'preact';

export interface PickItem<T> {
  key: string;
  /** What we search by. Exactly the string a human sees. */
  text: string;
  value: T;
}

export interface PickProps<T> {
  windows: Windows;
  id: string;
  title: string;
  meta?: ComponentChildren;
  items: Array<PickItem<T>>;
  placeholder: string;
  empty: string;
  size: Size;
  min: Size;
  onClose: () => void;
  onPick: (value: T) => void;
  row: (value: T, matches: number[], picked: boolean) => JSX.Element;
  /**
   * What distinguishes a row from its neighbour in the group. Present means the list
   * gathers into sections with an UNSELECTABLE heading: fifty scripts in a monorepo can
   * only be read by eye that way. The heading is not part of the navigation.
   */
  section?: (value: T) => string;
  footer?: ComponentChildren;
  /** What to draw over the top — a dropdown menu, for instance. */
  extra?: ComponentChildren;
  onMouseDown?: (event: MouseEvent) => void;
}
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fuzzy } from './fuzzy.js';
import { Popup } from './popup.js';

/**
 * A popup with a list and fuzzy search.
 *
 * The shape of the props is declared HERE: the popup moved into the shared package, and
 * the types moved with it. They used to stand in the plugin contract — because the
 * contract was the only place both sides could look. The old doctrine below stayed true
 * in substance: this popup is handed to plugins, so its signature is a contract, and it
 * lives where the rest of the contract does. Drifting is impossible: the application
 * signs up to `IdeServices`, and a mismatched signature is caught by the compiler right
 * there.
 *
 * This turned out to be the most reused piece of the interface: branches, scripts, and
 * next will be actions and anything else. So there is one of it — with search, arrows,
 * Enter, matched-letter highlighting and a stack of popups.
 *
 * What to show in a row is decided by the caller: `row` receives the item and the match
 * positions. Everything else is shared, and a new list gets it by the fact of being
 * born rather than rewriting it.
 */

export function PickPopup<T>({ windows,
  id,
  title,
  meta,
  items,
  placeholder,
  empty,
  size,
  min,
  onClose,
  onPick,
  row,
  section,
  footer,
  extra,
  onMouseDown,
}: PickProps<T>) {
  const t = useT();
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const [at, setAt] = useState(0);

  const shown = useMemo(() => {
    const query = filter.trim();
    const found =
      query === ''
        ? items.map((item) => ({ item, matches: [] as number[] }))
        : items
            .map((item) => ({ item, hit: fuzzy.find(item.text, query) }))
            .filter(
              (hit): hit is { item: PickItem<T>; hit: { score: number; matches: number[] } } =>
                hit.hit !== null,
            )
            .sort((a, b) => b.hit.score - a.hit.score)
            .map((hit) => ({ item: hit.item, matches: hit.hit.matches }));
    return section ? grouped(found, section) : found;
  }, [items, filter, section]);

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    list.current?.querySelector('.pick-row.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [at, shown.length]);

  useEffect(() => {
    windows.activePick.value = {
      next: () => setAt((was) => (shown.length ? (was + 1) % shown.length : 0)),
      prev: () => setAt((was) => (shown.length ? (was - 1 + shown.length) % shown.length : 0)),
      accept: () => {
        const pick = shown[at];
        if (pick) onPick(pick.item.value);
      },
    };
    return () => {
      windows.activePick.value = null;
    };
  }, [shown, at, onPick]);

  return (
    <Popup windows={windows} id={id} keys="pick" class="pick" size={size} min={min} onClose={onClose} onMouseDown={onMouseDown}>
      <div class="pick-top">
        <span class="pick-title">{title}</span>
        {meta && <span class="pick-meta">{meta}</span>}
      </div>

      <div class="pick-filter">
        <input
          ref={field}
          class="field"
          placeholder={placeholder}
          value={filter}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => {
            setFilter((e.target as HTMLInputElement).value);
            setAt(0);
          }}
        />
      </div>

      <div class={`pick-list ${section ? 'is-sectioned' : ''}`} ref={list}>
        {shown.map((found, index) => {
          const head = section?.(found.item.value);
          const before = shown[index - 1];
          const first = head !== undefined && (!before || head !== section?.(before.item.value));
          return (
            <Fragment key={found.item.key}>
              {first && <div class="pick-head">{head}</div>}
              <div
                class={`pick-row ${index === at ? 'is-current' : ''}`}
                onMouseMove={index === at ? undefined : () => setAt(index)}
                onClick={() => onPick(found.item.value)}
              >
                {row(found.item.value, found.matches, index === at)}
              </div>
            </Fragment>
          );
        })}
        {shown.length === 0 && (
          <div class="se-empty">{items.length === 0 ? empty : t('pick.nothing')}</div>
        )}
      </div>

      {footer}
      {extra}
    </Popup>
  );
}

/**
 * Gather rows into sections without breaking the order by relevance.
 *
 * Sections go in the order their BEST row was met, and inside a section the order stays
 * as it was. That way a search neither scatters the groups across the whole list nor
 * sinks the most suitable into the middle.
 */
export function grouped<T>(
  found: Array<{ item: PickItem<T>; matches: number[] }>,
  section: (value: T) => string,
): Array<{ item: PickItem<T>; matches: number[] }> {
  const order = new Map<string, number>();
  for (const row of found) {
    const name = section(row.item.value);
    if (!order.has(name)) order.set(name, order.size);
  }
  return found
    .map((row, index) => ({ row, index, rank: order.get(section(row.item.value)) ?? 0 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.row);
}

/**
 * Highlighting the matched letters.
 *
 * Two pure questions about one thing: where the letters matched, and how to show that.
 * They are kept together, because the second is meaningless without the first.
 */
export class Matches {
  shiftMatches(matches: number[], from: number, length: number): number[] {
    return matches
      .map((at) => at - from)
      .filter((at) => at >= 0 && at < length);
  }

  /** Highlight the matched letters — the very positions the matcher returned. */

  highlight(text: string, matches: number[]): ComponentChildren {
    if (matches.length === 0) return text;
    const hot = new Set(matches);
    const parts: ComponentChildren[] = [];
    let run = '';
    let runHot = hot.has(0);
    for (let i = 0; i < text.length; i += 1) {
      const isHot = hot.has(i);
      if (isHot !== runHot) {
        parts.push(runHot ? <b key={i}>{run}</b> : run);
        run = '';
        runHot = isHot;
      }
      run += text[i];
    }
    parts.push(runHot ? <b key="last">{run}</b> : run);
    return parts;
  }
}

/** One per tab. */
export const matches = new Matches();
