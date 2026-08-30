import { tools, type ToolKind } from '../state/tools.js';
import { t } from '../i18n/index.js';
import { Popup } from './popup.js';

interface Row {
  path: string;
  name: string;
  ref: string;
  current: boolean;
  mark?: string;
}

export function ToolPicker() {
  const kind = tools.picker.value;
  if (!kind) return null;

  return (
    <Popup
      id={`tool-${kind}`}
      keys="prompt"
      class="tools"
      size={{ w: 560, h: 380 }}
      min={{ w: 380, h: 240 }}
      onClose={() => tools.close()}
    >
      <div class="tools-title">{t(`tool.${kind}.title`)}</div>
      <div class="tools-note">{t(`tool.${kind}.note`)}</div>

      <div class="tools-list">
        {rows(kind).map((row) => (
          <div
            key={row.path}
            class={`tools-row ${row.current ? 'is-current' : ''}`}
            title={row.path}
            onClick={() => void tools.choose(kind, row.ref)}
          >
            <span class="tools-name">{row.name}</span>
            <span class="tools-path">{row.path}</span>
            {row.mark && <span class="tools-mark">{row.mark}</span>}
          </div>
        ))}
        {rows(kind).length === 0 && <div class="tools-empty">{t('tool.empty')}</div>}
      </div>

      <div class="tools-custom">
        <input
          class="tools-input"
          value={tools.draft.value}
          placeholder={t(`tool.${kind}.custom`)}
          onInput={(event) => {
            tools.draft.value = (event.target as HTMLInputElement).value;
          }}
        />
        <button class="tools-apply" onClick={() => void tools.choose(kind, tools.draft.value.trim())}>
          {t('tool.apply')}
        </button>
      </div>
      <div class="tools-reset" onClick={() => void tools.choose(kind, '')}>
        {t(`tool.${kind}.default`)}
      </div>
    </Popup>
  );
}

function rows(kind: ToolKind): Row[] {
  if (kind === 'shell') {
    return tools.shells.value.map((item) => ({
      path: item.path,
      name: item.name,
      ref: item.ref,
      current: item.current,
      mark: item.current ? t('tool.inUse') : undefined,
    }));
  }
  return tools.managers.value.map((item) => ({
    path: item.path,
    name: item.name,
    ref: item.path,
    current: item.current,
    mark: item.suggested ? t('tool.byProject') : item.current ? t('tool.inUse') : undefined,
  }));
}
