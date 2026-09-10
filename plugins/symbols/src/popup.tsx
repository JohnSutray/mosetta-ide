import { settingsOf, t } from '@ide/api/client';
import { useEffect, useRef } from 'preact/hooks';
import type CodePlugin from '@ide/plugin-code';
import { EDITOR_DEFAULTS } from '@ide/plugin-code';
import { Popup, Resizer } from '@ide/ui';
import type { Windows } from '@ide/windows';
import type { Symbols } from './state.js';

const SIZE = { w: 620, h: 420 };
const MIN = { w: 320, h: 220 };

const LIST_ID = 'symbols.list';
const LIST_DEFAULT = 150;
const LIST_MIN = 60;
const PREVIEW_MIN = 120;

export function SymbolsPopup({ windows, symbols, code }: { windows: Windows; symbols: Symbols; code: CodePlugin }) {
  const list = symbols.list.value;
  const editor = settingsOf('editor', EDITOR_DEFAULTS).value;
  const preview = symbols.preview.value;
  const body = useRef<HTMLDivElement>(null);

  const limits = () => {
    const full = body.current?.parentElement?.getBoundingClientRect().height ?? 400;
    return { min: LIST_MIN, max: Math.max(LIST_MIN, full - PREVIEW_MIN) };
  };

  useEffect(() => {
    body.current?.querySelector('.symbols-row.is-current > *')?.scrollIntoView({
      block: 'nearest',
    });
  }, [list?.at, list?.sites.length, symbols.hideImports.value]);

  if (!list || !editor) return null;
  const sites = symbols.shown(list);
  const passed = symbols.filtered(list);
  const hidden = list.sites.length - passed.length;
  const cut = passed.length - sites.length;

  return (
    <Popup windows={windows}
      id="symbols"
      keys="pick"
      class="symbols"
      size={SIZE}
      min={MIN}
      layer
      clear
      anchor={{ x: list.x, y: list.y }}
      onClose={() => symbols.close()}
    >
      <div class="symbols-head">
        <span class="symbols-title">
          {t(list.kind === 'usages' ? 'symbols.usages' : 'symbols.definition', {
            word: list.word || '?',
          })}
        </span>
        <span class="symbols-count">{passed.length}</span>
        <span
          class={`symbols-filter ${symbols.hideImports.value ? 'is-on' : ''}`}
          title={t('symbols.imports.hint')}
          onClick={() => symbols.toggleImports()}
        >
          {t('symbols.imports', { count: hidden })}
        </span>
      </div>

      <div
        class="symbols-list"
        ref={body}
        style={{ height: `${windows.geometry.widthOf(LIST_ID, LIST_DEFAULT)}px` }}
      >
        {sites.map((site, at) => (
          <div
            key={`${site.path}:${site.line}:${site.character}`}
            class={`symbols-row ${at === list.at ? 'is-current' : ''}`}
            title={`${site.path}:${site.line + 1}`}
            onMouseMove={at === list.at ? undefined : () => symbols.select(at)}
            onClick={() => {
              symbols.select(at);
              symbols.accept();
            }}
          >
            <span class="symbols-where">{site.path}</span>
            <span class="symbols-line">{site.line + 1}</span>
            <span class="symbols-text">
              {code.painter.paint(site.preview, site.path).map((chunk, i) =>
                chunk.color ? (
                  <span key={i} style={{ color: chunk.color }}>
                    {chunk.text}
                  </span>
                ) : (
                  chunk.text
                ),
              )}
            </span>
          </div>
        ))}
        {cut > 0 && <div class="symbols-more">{t('symbols.more', { count: cut })}</div>}
      </div>

      <Resizer windows={windows} id={LIST_ID} side="left" axis="y" limits={limits} defaultWidth={LIST_DEFAULT} />

      <div class="symbols-preview">
        {preview ? (
          <code.View
            key={preview.path}
            path={preview.path}
            text={preview.text}
            line={preview.line}
            settings={editor}
          />
        ) : null}
      </div>
    </Popup>
  );
}
