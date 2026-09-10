import { useLayoutEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { t } from '@ide/api/client';
import { codePainter } from '@ide/code';
import type { Ranked } from './ranker.js';
import type { CompletionSession } from './session.js';
import type { ItemKind } from './types.js';

const BADGES: Record<ItemKind, string> = {
  method: 'm',
  function: 'ƒ',
  constructor: 'c',
  field: 'f',
  property: 'p',
  variable: 'v',
  constant: 'c',
  class: 'C',
  interface: 'I',
  enum: 'E',
  member: 'e',
  module: 'M',
  keyword: 'k',
  snippet: 's',
  type: 'T',
  file: 'F',
  folder: 'D',
  text: 't',
  other: '·',
  word: 'w',
  postfix: '.',
};

interface Props {
  session: CompletionSession;
  path: () => string | null;
  onPick: (index: number) => void;
}

export function CompletionList({ session, path, onPick }: Props) {
  const items = session.items.value;
  const selected = session.selected.value;
  const details = session.details.value;
  const loading = session.loading.value;
  const list = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    (list.current?.children[selected] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [selected, items]);

  if (items.length === 0 && !loading) return null;
  return (
    <div class="cmp" onMouseDown={(event) => event.preventDefault()}>
      <div class="cmp-main">
        <div class="cmp-list" ref={list}>
          {items.map((ranked, index) => (
            <Row key={ranked.key} ranked={ranked} selected={index === selected} onClick={() => onPick(index)} />
          ))}
        </div>
        {loading && <div class="cmp-foot">{t('completion.loading')}</div>}
      </div>
      {details && (details.detail || details.documentation) && (
        <div class="cmp-docs">
          {details.detail && (
            <div class="cmp-docs-code">
              {codePainter.paint(details.detail, path() ?? 'a.ts').map((chunk, index) => (
                <span key={index} style={chunk.color ? { color: chunk.color } : undefined}>
                  {chunk.text}
                </span>
              ))}
            </div>
          )}
          {details.documentation && <div class="cmp-docs-text">{details.documentation}</div>}
        </div>
      )}
    </div>
  );
}

function Row({ ranked, selected, onClick }: { ranked: Ranked; selected: boolean; onClick: () => void }) {
  const { item } = ranked;
  return (
    <div class={`cmp-row${selected ? ' is-selected' : ''}${item.deprecated ? ' is-deprecated' : ''}`} onClick={onClick}>
      <span class={`cmp-kind cmp-kind-${item.kind}`}>{BADGES[item.kind]}</span>
      <span class="cmp-label">{marked(item.label, ranked.positions)}</span>
      {item.detail && <span class="cmp-detail">{item.detail}</span>}
    </div>
  );
}

function marked(label: string, positions: number[]) {
  if (positions.length === 0) return label;
  const hit = new Set(positions);
  const out: Array<string | JSX.Element> = [];
  let at = 0;
  while (at < label.length) {
    const on = hit.has(at);
    let end = at;
    while (end < label.length && hit.has(end) === on) end += 1;
    const text = label.slice(at, end);
    out.push(on ? <b key={at}>{text}</b> : text);
    at = end;
  }
  return out;
}
