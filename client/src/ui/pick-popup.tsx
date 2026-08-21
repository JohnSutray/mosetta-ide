import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { activePick } from '../state/pick.js';
import { fuzzy } from './fuzzy.js';
import { Popup } from './popup.js';
import { t } from '../i18n/index.js';
import type { Size } from '../state/layout.js';

export interface PickItem<T> {
  key: string;
  text: string;
  value: T;
}

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
  footer,
  extra,
  onMouseDown,
}: {
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
  footer?: ComponentChildren;
  extra?: ComponentChildren;
  onMouseDown?: (event: MouseEvent) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const [at, setAt] = useState(0);

  const shown = useMemo(() => {
    const query = filter.trim();
    if (query === '') return items.map((item) => ({ item, matches: [] as number[] }));
    return items
      .map((item) => ({ item, hit: fuzzy(item.text, query) }))
      .filter((found): found is { item: PickItem<T>; hit: { score: number; matches: number[] } } =>
        found.hit !== null,
      )
      .sort((a, b) => b.hit.score - a.hit.score)
      .map((found) => ({ item: found.item, matches: found.hit.matches }));
  }, [items, filter]);

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
    <Popup id={id} class="pick" size={size} min={min} onClose={onClose} onMouseDown={onMouseDown}>
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

      <div class="pick-list" ref={list}>
        {shown.map((found, index) => (
          <div
            key={found.item.key}
            class={`pick-row ${index === at ? 'is-current' : ''}`}
            onMouseMove={index === at ? undefined : () => setAt(index)}
            onClick={() => onPick(found.item.value)}
          >
            {row(found.item.value, found.matches, index === at)}
          </div>
        ))}
        {shown.length === 0 && (
          <div class="se-empty">{items.length === 0 ? empty : t('pick.nothing')}</div>
        )}
      </div>

      {footer}
      {extra}
    </Popup>
  );
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
