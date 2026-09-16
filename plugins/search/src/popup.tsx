import type { Windows } from '@mosetta/ide-plugin-ui';
import { useIde, useT } from '@mosetta/ide-api/client';
import { useEffect, useRef } from 'preact/hooks';
import type CodePlugin from '@mosetta/ide-plugin-code';
import { EDITOR_DEFAULTS } from '@mosetta/ide-plugin-code';
import type { EditorSettings } from '@mosetta/ide-plugin-code';
import type { FileViewLike, IndexHit } from './types.js';
import { Chevron, Chip, ChipRow, FileIcon, Popup } from '@mosetta/ide-plugin-ui';
import type { Search } from './state.js';

export function SearchEverywhere({
  windows,
  search,
  code,
  views,
}: {
  windows: Windows;
  search: Search;
  code: CodePlugin;
  views: FileViewLike[];
}) {
  const ide = useIde();
  const t = useT();
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

  const editor = ide.settingsOf('editor', EDITOR_DEFAULTS).value;
  if (!search.open.value) return null;

  const preview = search.preview.value;
  const shown = search.hits.value.length;
  const total = search.total.value;

  return (
    <Popup windows={windows}
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
          <span class="se-count">
            {total > shown ? t('search.some', { shown, total }) : shown}
          </span>
        </div>

        {search.kinds.value.length > 1 && (
          <ChipRow class="se-kinds">
            {search.kinds.value.map((kind) => (
              <Chip
                key={kind}
                on={!search.isOff(kind)}
                onToggle={() => search.toggleKind(kind)}
              >
                {t(search.kindTitle(kind))}
              </Chip>
            ))}
          </ChipRow>
        )}

        {search.notes.value.map((note) => (
          <div class="se-coverage" key={note.key}>
            <span>{t(note.key, note.params)}</span>
            {note.setting !== undefined &&
              (ide.knownCommands.value.some((one) => one.id === 'settings.show') ? (
                <button class="se-raise" onClick={() => ide.runCommand('settings.show')}>
                  {note.setting}
                </button>
              ) : (
                <span class="se-raise-key">{note.setting}</span>
              ))}
          </div>
        ))}

        <div class="se-body">
          <div class="se-list" ref={list}>
            {search.rows.value.map((row, i) =>
              'header' in row ? (
                <button
                  type="button"
                  class={`se-section ${row.folded ? 'is-folded' : ''}`}
                  key={`h${i}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => search.toggleSection(row.kind)}
                >
                  <span class="se-chevron">
                    <Chevron />
                  </span>
                  <span class="se-section-name">{t(row.header)}</span>
                  <span class="se-section-count">{row.count}</span>
                </button>
              ) : (
                <Row
                  key={row.hit.label + row.at}
                  hit={row.hit}
                  icon={search.iconFor(row.hit)}
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
              <Preview preview={preview} views={views} code={code} settings={editor} />
            ) : (
              <div class="se-empty">{t('search.preview')}</div>
            )}
          </div>
        </div>
    </Popup>
  );
}

function Preview({
  preview,
  views,
  code,
  settings,
}: {
  preview: { path: string; text: string; line: number };
  views: FileViewLike[];
  code: CodePlugin;
  settings: EditorSettings;
}) {
  const text = () => (
    <code.View
      key={preview.path}
      path={preview.path}
      text={preview.text}
      line={preview.line}
      settings={settings}
    />
  );
  const shown = views.find((one) => one.opens(preview.path));
  if (!shown) return text() as never;
  return shown.view({ path: preview.path, text: preview.text }, text) as never;
}

function Row({
  hit,
  icon,
  current,
  onPick,
  onOpen,
}: {
  hit: IndexHit;
  icon: unknown;
  current: boolean;
  onPick: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <div
      class={`se-row ${current ? 'is-current' : ''}`}
      onMouseMove={current ? undefined : onPick}
      onClick={onOpen}
    >
      <span class="se-row-icon">{(icon as never) ?? fileIcon(hit)}</span>
      <span class="se-label">{highlight(hit.label, hit.matches)}</span>
      {(hit.detail || hit.detailKey) && (
        <span class="se-detail">
          {hit.detailKey ? t(hit.detailKey) : ''}
          {hit.detailKey && hit.detail ? ' · ' : ''}
          {hit.detail}
        </span>
      )}
    </div>
  );
}

function fileIcon(hit: IndexHit) {
  const name = hit.path.split('/').pop() ?? '';
  if (name === '' || !name.includes('.')) return null;
  return <FileIcon name={name} />;
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
