import { useEffect, useRef } from 'preact/hooks';
import { editorSettings } from '../state/config.js';
import { enter, leave } from '../state/popups.js';
import {
  accept,
  closeSymbols,
  hideImports,
  select,
  filteredSites,
  shownSites,
  symbolList,
  symbolPreview,
  toggleImports,
} from '../state/symbols.js';
import { CodeView } from '../editor/code-view.js';
import { t } from '../i18n/index.js';

export function Symbols() {
  const list = symbolList.value;
  const preview = symbolPreview.value;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!list) return;
    enter({ id: 'symbols', close: closeSymbols, layer: true });
    box.current?.focus({ preventScroll: true });
    return () => leave('symbols');
  }, [list !== null]);

  useEffect(() => {
    const el = box.current;
    if (!el || !list) return;
    el.style.left = `${Math.max(8, Math.min(list.x, window.innerWidth - el.offsetWidth - 8))}px`;
    const below = list.y + 6;
    const fits = below + el.offsetHeight < window.innerHeight - 8;
    el.style.top = fits ? `${below}px` : `${Math.max(8, list.y - el.offsetHeight - 22)}px`;
  }, [list?.x, list?.y, list?.sites.length, hideImports.value]);

  if (!list) return null;
  const sites = shownSites(list);
  const passed = filteredSites(list);
  const hidden = list.sites.length - passed.length;
  const cut = passed.length - sites.length;

  return (
    <div class="symbols" ref={box} data-keys="pick" tabIndex={-1}>
      <div class="symbols-head">
        <span class="symbols-title">
          {t(list.kind === 'usages' ? 'symbols.usages' : 'symbols.definition', {
            word: list.word || '?',
          })}
        </span>
        <span class="symbols-count">{passed.length}</span>
        <span
          class={`symbols-filter ${hideImports.value ? 'is-on' : ''}`}
          title={t('symbols.imports.hint')}
          onClick={toggleImports}
        >
          {t('symbols.imports', { count: hidden })}
        </span>
        <span class="symbols-close panel-close" title={t('popup.close')} onClick={closeSymbols}>
          ×
        </span>
      </div>

      <div class="symbols-list">
        {sites.map((site, at) => (
          <div
            key={`${site.path}:${site.line}:${site.character}`}
            class={`symbols-row ${at === list.at ? 'is-current' : ''}`}
            title={`${site.path}:${site.line + 1}`}
            onMouseMove={at === list.at ? undefined : () => select(at)}
            onClick={() => {
              select(at);
              accept();
            }}
          >
            <span class="symbols-where">
              {site.path}
              <span class="symbols-line">:{site.line + 1}</span>
            </span>
            <span class="symbols-text">{site.preview}</span>
          </div>
        ))}
        {cut > 0 && <div class="symbols-more">{t('symbols.more', { count: cut })}</div>}
      </div>

      <div class="symbols-preview">
        {preview ? (
          <CodeView
            key={preview.path}
            path={preview.path}
            text={preview.text}
            line={preview.line}
            settings={editorSettings()}
          />
        ) : null}
      </div>
    </div>
  );
}
