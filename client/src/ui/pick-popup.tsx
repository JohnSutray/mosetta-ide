import { Fragment } from 'preact';
import type { ComponentChildren } from 'preact';
import type { PickItem, PickProps } from '@ide/api/client';
export type { PickItem, PickProps } from '@ide/api/client';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { activePick } from '../state/pick.js';
import { fuzzy } from './fuzzy.js';
import { Popup } from './popup.js';
import { t } from '../i18n/index.js';

export function PickPopup<T>({
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
            .map((item) => ({ item, hit: fuzzy(item.text, query) }))
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
    activePick.value = {
      next: () => setAt((was) => (shown.length ? (was + 1) % shown.length : 0)),
      prev: () => setAt((was) => (shown.length ? (was - 1 + shown.length) % shown.length : 0)),
      accept: () => {
        const pick = shown[at];
        if (pick) onPick(pick.item.value);
      },
    };
    return () => {
      activePick.value = null;
    };
  }, [shown, at, onPick]);

  return (
    <Popup id={id} keys="pick" class="pick" size={size} min={min} onClose={onClose} onMouseDown={onMouseDown}>
      <div class="branches-head">
        <span class="branches-title">{title}</span>
        {meta && <span class="branches-meta">{meta}</span>}
      </div>

      <div class="branches-filter">
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

export function shiftMatches(matches: number[], from: number, length: number): number[] {
  return matches
    .map((at) => at - from)
    .filter((at) => at >= 0 && at < length);
}

export function highlight(text: string, matches: number[]): ComponentChildren {
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
