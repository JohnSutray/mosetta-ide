import { editorSettings } from '../state/config.js';
import { Popup } from './popup.js';
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

const SIZE = { w: 620, h: 420 };
const MIN = { w: 320, h: 220 };

export function Symbols() {
  const list = symbolList.value;
  const preview = symbolPreview.value;

  if (!list) return null;
  const sites = shownSites(list);
  const passed = filteredSites(list);
  const hidden = list.sites.length - passed.length;
  const cut = passed.length - sites.length;

  return (
    <Popup
      id="symbols"
      keys="pick"
      class="symbols"
      size={SIZE}
      min={MIN}
      layer
      clear
      anchor={{ x: list.x, y: list.y }}
      onClose={closeSymbols}
    >
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
    </Popup>
  );
}
