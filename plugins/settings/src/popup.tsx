import { useIde, useT, type SettingsEntry } from '@mosetta/ide-api/client';
import type { SettingValue } from '@mosetta/ide-protocol';
import { Chevron, Popup, type Windows } from '@mosetta/ide-plugin-ui';
import { useRef, useState } from 'preact/hooks';
import type { SettingAt, SettingGroup, SettingRow, SettingsModel, SettingsWindow } from './state.js';

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
  const field = useRef<HTMLInputElement>(null);
  if (!win.open.value) return null;

  const label = (row: SettingRow) => {
    const text = t(row.label);
    return text === row.label ? row.key : text;
  };
  const groups = model.filter(
    model.groups(entries.value, ide.settings.value, ide.settingsFile.value, ide.projectFile.value),
    win.term.value,
    label,
  );
  const fail = (err: unknown) => ide.notes.notify(err instanceof Error ? err.message : String(err), 'error');
  const write = (row: SettingRow, value: SettingValue) =>
    void ide.setSetting(row.section, row.key, value, row.at === 'project' ? 'project' : 'user').catch(fail);
  const place = (row: SettingRow, at: SettingAt) => {
    if (at === row.at) return;
    if (at === 'default') return void ide.resetSetting(row.section, row.key).catch(fail);
    void ide.setSetting(row.section, row.key, row.value as SettingValue, at).catch(fail);
  };

  return (
    <Popup
      windows={windows}
      id="settings.show"
      keys="settings"
      class="settings"
      size={{ w: 1040, h: 660 }}
      min={{ w: 640, h: 320 }}
      onClose={() => win.close()}
    >
      <div class="settings-top">
        <span class="settings-title">{t('settings.title')}</span>
        <span class="settings-search">
          <input
            ref={field}
            class="field settings-filter"
            placeholder={t('settings.filter')}
            value={win.term.value}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => (win.term.value = (event.target as HTMLInputElement).value)}
          />
          {win.term.value !== '' && (
            <button
              class="settings-filter-x"
              title={t('settings.clear')}
              onClick={() => {
                win.term.value = '';
                field.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </span>
      </div>
      <div class="settings-list">
        {groups.map((group) => (
          <Group key={group.owner} group={group} open={win.isOpen(group.owner)} onToggle={() => win.toggleGroup(group.owner)}>
            {group.rows.map((row) => (
              <div class={`settings-row ${row.overridden ? 'is-set' : ''}`} key={row.path}>
                <span class="settings-chip is-path" title={row.path}>
                  <Hit text={row.path} term={win.term.value} model={model} />
                </span>
                <span class="settings-label">
                  <Hit text={label(row)} term={win.term.value} model={model} />
                </span>
                <div class="settings-value">
                  <Field row={row} write={write} />
                </div>
                <div class="settings-tail">
                  <Scope row={row} canProject={ide.projectPath.value !== null} onPlace={place} />
                </div>
              </div>
            ))}
          </Group>
        ))}
        {groups.length === 0 && <div class="settings-empty">{t('settings.nothing')}</div>}
      </div>
    </Popup>
  );
}

function Scope({
  row,
  canProject,
  onPlace,
}: {
  row: SettingRow;
  canProject: boolean;
  onPlace: (row: SettingRow, at: SettingAt) => void;
}) {
  const t = useT();
  if (row.kind === 'object') return null;
  const stops: SettingAt[] = ['default', 'user', 'project'];
  return (
    <div class="settings-scope" role="radiogroup">
      {stops.map((at) => {
        const off = at === 'project' && !canProject;
        return (
          <button
            key={at}
            class={`settings-stop ${row.at === at ? 'is-on' : ''}`}
            role="radio"
            aria-checked={row.at === at}
            disabled={off}
            title={t(off ? 'settings.scope.noProject' : `settings.scope.${at}Tip`)}
            onClick={() => onPlace(row, at)}
          >
            {t(`settings.scope.${at}`)}
          </button>
        );
      })}
    </div>
  );
}

function Hit({ text, term, model }: { text: string; term: string; model: SettingsModel }) {
  const parts = model.split(text, term);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, at) =>
        part.hit ? (
          <mark class="settings-hit" key={at}>
            {part.text}
          </mark>
        ) : (
          <>{part.text}</>
        ),
      )}
    </>
  );
}

function Group({
  group,
  open,
  onToggle,
  children,
}: {
  group: SettingGroup;
  open: boolean;
  onToggle: () => void;
  children: preact.ComponentChildren;
}) {
  const t = useT();
  const changed = group.rows.filter((row) => row.overridden).length;
  const fromProject = group.rows.filter((row) => row.at === 'project').length;
  return (
    <section class={`settings-group ${open ? 'is-open' : ''}`}>
      <button class="settings-group-head" aria-expanded={open} onClick={onToggle}>
        <span class={`chevron ${open ? 'is-open' : ''}`}>
          <Chevron />
        </span>
        <span class="settings-group-title" title={t(group.title)}>
          {t(group.title)}
        </span>
        <span class="settings-chip is-owner">{group.owner}</span>
        <span class="settings-group-count">
          {fromProject > 0 && (
            <span class="settings-group-project">{t('settings.inProject', { count: fromProject })}</span>
          )}
          {changed > 0 && <span class="settings-group-changed">{t('settings.changed', { count: changed })}</span>}
          {t(group.rows.length === 1 ? 'settings.countOne' : 'settings.count', { count: group.rows.length })}
        </span>
      </button>
      {open && <div class="settings-rows">{children}</div>}
    </section>
  );
}

function Field({ row, write }: { row: SettingRow; write: (row: SettingRow, value: SettingValue) => void }) {
  const t = useT();
  switch (row.kind) {
    case 'boolean': {
      const on = row.value === true;
      return (
        <button type="button" role="switch" aria-checked={on} class={`settings-switch ${on ? 'is-on' : ''}`} onClick={() => write(row, !on)}>
          <span class="settings-knob" />
        </button>
      );
    }
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
              {one === '' ? t('settings.auto') : one}
            </option>
          ))}
        </select>
      );
    case 'list':
      return <Chips values={Array.isArray(row.value) ? (row.value as string[]) : []} onChange={(next) => write(row, next)} />;
    case 'object':
      return (
        <span class="settings-object">
          <code>{JSON.stringify(row.value)}</code>
          <span class="settings-note">{t(row.at === 'project' ? 'settings.inProjectFile' : 'settings.inFile')}</span>
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

function Chips({ values, onChange }: { values: string[]; onChange: (next: string[]) => void }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    setDraft('');
    if (value === '' || values.includes(value)) return;
    onChange([...values, value]);
  };
  return (
    <div class="settings-chips">
      {values.map((value) => (
        <span class="settings-chip is-value" key={value}>
          {value}
          <button class="settings-chip-x" title={t('settings.remove')} onClick={() => onChange(values.filter((one) => one !== value))}>
            ×
          </button>
        </span>
      ))}
      <span class="settings-chip-new">
        <input
          class="settings-chip-input"
          value={draft}
          placeholder={t('settings.addPlaceholder')}
          spellcheck={false}
          onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        <button class="settings-chip-add" title={t('settings.add')} onClick={add}>
          +
        </button>
      </span>
    </div>
  );
}
