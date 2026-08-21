import { useEffect, useRef } from 'preact/hooks';
import type { IndexHit } from '@ide/protocol';
import {
  acceptSelected,
  closeSearch,
  searchHits,
  searchOpen,
  searchPreview,
  searchQuery,
  searchRows,
  searchSelected,
  selectAt,
  setQuery,
} from '../state/search.js';

export function SearchEverywhere() {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen.value) return;
    input.current?.focus();
    input.current?.select();
  }, [searchOpen.value]);

  useEffect(() => {
    list.current
      ?.querySelector('.se-row.is-current')
      ?.scrollIntoView({ block: 'nearest' });
  }, [searchSelected.value, searchHits.value]);

  if (!searchOpen.value) return null;

  const preview = searchPreview.value;

  return (
    <div class="se-backdrop" onMouseDown={closeSearch}>
      <div class="se" onMouseDown={(e) => e.stopPropagation()}>
        <div class="se-input-row">
          <span class="se-icon">⌕</span>
          <input
            ref={input}
            class="se-input"
            value={searchQuery.value}
            spellcheck={false}
            placeholder="Файлы, ts::символы, npm::скрипты"
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <span class="se-count">{searchHits.value.length}</span>
        </div>

        <div class="se-body">
          <div class="se-list" ref={list}>
            {searchRows.value.map((row, i) =>
              'header' in row ? (
                <div class="se-section" key={`h${i}`}>
                  {row.header}
                </div>
              ) : (
                <Row
                  key={row.hit.label + row.at}
                  hit={row.hit}
                  current={row.at === searchSelected.value}
                  onPick={() => selectAt(row.at)}
                  onOpen={acceptSelected}
                />
              ),
            )}
            {searchHits.value.length === 0 && searchQuery.value.trim() !== '' && (
              <div class="se-empty">Ничего не нашлось</div>
            )}
          </div>

          <div class="se-preview">
            {preview ? (
              <Preview text={preview.text} line={preview.line} />
            ) : (
              <div class="se-empty">Предпросмотр</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  hit,
  current,
  onPick,
  onOpen,
}: {
  hit: IndexHit;
  current: boolean;
  onPick: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      class={`se-row ${current ? 'is-current' : ''}`}
      onMouseMove={current ? undefined : onPick}
      onClick={onOpen}
    >
      <span class="se-label">{highlight(hit.label, hit.matches)}</span>
      {hit.detail && <span class="se-detail">{hit.detail}</span>}
    </div>
  );
}

function highlight(label: string, matches: number[]) {
  if (matches.length === 0) return label;
  const hot = new Set(matches);
  const parts = [];
  let run = '';
  let runHot = hot.has(0);
  for (let i = 0; i < label.length; i += 1) {
    const isHot = hot.has(i);
    if (isHot !== runHot) {
      parts.push(runHot ? <b key={i}>{run}</b> : run);
      run = '';
      runHot = isHot;
    }
    run += label[i];
  }
  parts.push(runHot ? <b key="last">{run}</b> : run);
  return parts;
}

function Preview({ text, line }: { text: string; line: number }) {
  const lines = text.split('\n');
  const from = Math.max(0, line - 8);
  const to = Math.min(lines.length, from + 40);
  return (
    <pre class="se-code">
      {lines.slice(from, to).map((content, i) => {
        const at = from + i;
        return (
          <div key={at} class={`se-code-line ${at === line ? 'is-hit' : ''}`}>
            <span class="se-code-no">{at + 1}</span>
            {content || ' '}
          </div>
        );
      })}
    </pre>
  );
}
