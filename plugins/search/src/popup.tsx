import { settings, t } from '@ide/api/client';
import { useEffect, useRef } from 'preact/hooks';
import { CodeView } from '@ide/code';
import type { IndexHit } from './types.js';
import { Popup } from '@ide/ui';
import type { Search } from './state.js';

export function SearchEverywhere({ search }: { search: Search }) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!search.open.value) return;
    input.current?.focus();
    input.current?.select();
  }, [search.open.value]);

  useEffect(() => {
    list.current
      ?.querySelector('.se-row.is-current')
      ?.scrollIntoView({ block: 'nearest' });
  }, [search.selected.value, search.hits.value]);

  const editor = settings.value?.editor;
  if (!search.open.value || !editor) return null;

  const preview = search.preview.value;

  return (
    <Popup
      id="search"
      keys="search"
      class="se"
      size={{ w: 1100, h: 640 }}
      min={{ w: 560, h: 300 }}
      onClose={() => search.close()}
    >
        <div class="se-input-row">
          <span class="se-icon">⌕</span>
          <input
            ref={input}
            class="se-input"
            value={search.query.value}
            spellcheck={false}
            placeholder={t('search.placeholder')}
            onInput={(e) => search.setQuery((e.target as HTMLInputElement).value)}
          />
          <span class="se-count">{search.hits.value.length}</span>
        </div>

        <div class="se-body">
          <div class="se-list" ref={list}>
            {search.rows.value.map((row, i) =>
              'header' in row ? (
                <div class="se-section" key={`h${i}`}>
                  {t(row.header)}
                </div>
              ) : (
                <Row
                  key={row.hit.label + row.at}
                  hit={row.hit}
                  current={row.at === search.selected.value}
                  onPick={() => search.selectAt(row.at)}
                  onOpen={() => search.accept()}
                />
              ),
            )}
            {search.hits.value.length === 0 && search.query.value.trim() !== '' && (
              <div class="se-empty">{t('search.empty')}</div>
            )}
          </div>

          <div class="se-preview">
            {preview ? (
              <CodeView
                key={preview.path}
                path={preview.path}
                text={preview.text}
                line={preview.line}
                settings={editor}
              />
            ) : (
              <div class="se-empty">{t('search.preview')}</div>
            )}
          </div>
        </div>
    </Popup>
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
