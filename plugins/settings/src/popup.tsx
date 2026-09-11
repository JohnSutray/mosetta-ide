import { useIde, useT, type SettingsEntry } from '@mosetta/ide-api/client';
import type { SettingValue } from '@mosetta/ide-protocol';
import { Popup, type Windows } from '@mosetta/ide-plugin-ui';
import type { SettingRow, SettingsModel, SettingsWindow } from './state.js';

export function SettingsPopup({
  windows,
  window: win,
  model,
  entries,
}: {
  windows: Windows;
  window: SettingsWindow;
  model: SettingsModel;
  entries: { readonly value: readonly SettingsEntry[] };
}) {
  const ide = useIde();
  const t = useT();
  if (!win.open.value) return null;

  const label = (row: SettingRow) => {
    const text = t(row.label);
    return text === row.label ? row.key : text;
  };
  const groups = model.filter(model.groups(entries.value, ide.settings.value, ide.settingsFile.value), win.term.value, label);
  const fail = (err: unknown) => ide.notes.notify(err instanceof Error ? err.message : String(err), 'error');
  const write = (row: SettingRow, value: SettingValue) => void ide.setSetting(row.section, row.key, value).catch(fail);
  const reset = (row: SettingRow) => void ide.resetSetting(row.section, row.key).catch(fail);

  return (
    <Popup
      windows={windows}
      id="settings.show"
      keys="settings"
      class="settings"
      size={{ w: 900, h: 640 }}
      min={{ w: 560, h: 320 }}
      onClose={() => win.close()}
    >
      <div class="settings-top">
        <span class="settings-title">{t('settings.title')}</span>
        <input
          class="field settings-filter"
          placeholder={t('settings.filter')}
          value={win.term.value}
          spellcheck={false}
          autocomplete="off"
          onInput={(event) => (win.term.value = (event.target as HTMLInputElement).value)}
        />
      </div>
      <div class="settings-list">
        {groups.map((group) => (
          <section class="settings-group" key={group.owner}>
            <div class="settings-group-head">
              <span class="settings-group-title">{t(group.title)}</span>
              <span class="settings-group-owner">{group.owner}</span>
            </div>
            {group.rows.map((row) => (
              <div class={`settings-row ${row.overridden ? 'is-set' : ''}`} key={row.path}>
                <div class="settings-name">
                  <span class="settings-label">{label(row)}</span>
                  <span class="settings-path">{row.path}</span>
                </div>
                <div class="settings-value">
                  <Field row={row} model={model} write={write} auto={t('settings.auto')} note={t('settings.inFile')} />
                </div>
                <button class="settings-reset" disabled={!row.overridden} title={t('settings.reset')} onClick={() => reset(row)}>
                  {t('settings.resetShort')}
                </button>
              </div>
            ))}
          </section>
        ))}
        {groups.length === 0 && <div class="settings-empty">{t('settings.nothing')}</div>}
      </div>
    </Popup>
  );
}

function Field({
  row,
  model,
  write,
  auto,
  note,
}: {
  row: SettingRow;
  model: SettingsModel;
  write: (row: SettingRow, value: SettingValue) => void;
  auto: string;
  note: string;
}) {
  switch (row.kind) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          class="settings-check"
          checked={row.value === true}
          onChange={(event) => write(row, (event.target as HTMLInputElement).checked)}
        />
      );
    case 'number':
      return (
        <input
          class="field settings-number"
          type="number"
          value={String(row.value)}
          onChange={(event) => {
            const next = Number((event.target as HTMLInputElement).value);
            if (Number.isFinite(next)) write(row, next);
          }}
        />
      );
    case 'choice':
      return (
        <select class="field settings-choice" value={String(row.value)} onChange={(event) => write(row, (event.target as HTMLSelectElement).value)}>
          {(row.options ?? []).map((one) => (
            <option key={one} value={one}>
              {one === '' ? auto : one}
            </option>
          ))}
        </select>
      );
    case 'list': {
      const list = Array.isArray(row.value) ? (row.value as string[]) : [];
      return (
        <textarea
          class="field settings-lines"
          rows={Math.min(6, Math.max(2, list.length + 1))}
          spellcheck={false}
          value={list.join('\n')}
          onChange={(event) => write(row, model.lines((event.target as HTMLTextAreaElement).value))}
        />
      );
    }
    case 'object':
      return (
        <span class="settings-object">
          <code>{JSON.stringify(row.value)}</code>
          <span class="settings-note">{note}</span>
        </span>
      );
    default:
      return (
        <input
          class="field settings-text"
          value={String(row.value ?? '')}
          spellcheck={false}
          onChange={(event) => write(row, (event.target as HTMLInputElement).value)}
        />
      );
  }
}
