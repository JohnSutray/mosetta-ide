import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useIde, useT } from '@mosetta/ide-api/client';
import type { IdeServices } from '@mosetta/ide-api/client';
import { keyHost } from './host.js';
import { Keyboard } from './keyboard.jsx';
import { personalKeymap } from './personal.js';
import { keymapRules } from './rules.js';
import type KeymapPlugin from './client.jsx';
import type { KeyBinding, Keymap, KeyScope } from './types.js';

export function KeymapEditor({ plugin }: { plugin: KeymapPlugin }) {
  const ide = useIde();
  const t = useT();
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<KeyBinding | null>(null);
  const [adding, setAdding] = useState(false);

  const layout = plugin.layout.value;
  const mine = plugin.personal.value;
  const here = `${keyHost.host}:${keyHost.os}` as KeyScope;

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return layout.bindings.filter((one) => {
      if (!needle) return true;
      const label = t(`command.${one.command}`).toLowerCase();
      return (
        one.key.toLowerCase().includes(needle) ||
        one.command.toLowerCase().includes(needle) ||
        label.includes(needle)
      );
    });
  }, [layout, term, t]);

  const save = (next: Keymap) => {
    const fail = (err: unknown) => ide.notes.notify(err instanceof Error ? err.message : String(err), 'error');
    if (next.bindings.length === 0) {
      void ide.resetSetting('keymap', 'bindings').catch(fail);
      return;
    }
    void ide.setSetting('keymap', 'bindings', next.bindings as never).catch(fail);
  };

  return (
    <div class="keymap-editor">
      <div class="keymap-top">
        <input
          class="field keymap-filter"
          placeholder={t('keymap.filter')}
          value={term}
          spellcheck={false}
          onInput={(event) => setTerm((event.target as HTMLInputElement).value)}
        />
        <button class="button keymap-add" onClick={() => setAdding(true)}>
          {t('keymap.add')}
        </button>
      </div>

      {adding && (
        <Chord
          plugin={plugin}
          title={t('keymap.addTitle')}
          binding={null}
          onCancel={() => setAdding(false)}
          onDone={(next) => {
            setAdding(false);
            save(personalKeymap.add(mine, next));
          }}
        />
      )}

      <div class="keymap-rows">
        {rows.map((one) => {
          const own = personalKeymap.isMine(mine, one);
          const open = editing !== null && keymapRules.slotOf(editing) === keymapRules.slotOf(one);
          return (
            <div class={`keymap-row ${own ? 'is-mine' : ''}`} key={`${keymapRules.slotOf(one)}:${one.command}`}>
              <button class="keymap-chord" onClick={() => setEditing(open ? null : one)}>
                <kbd class="keymap-kbd">{plugin.keys.humanize(one.key)}</kbd>
              </button>
              <span class="keymap-command">{commandLabel(t, one.command)}</span>
              <span class="keymap-where">
                {one.when && <span class="keymap-chip">{one.when}</span>}
                {one.where && !one.where.includes(here) && <span class="keymap-chip is-alien">{one.where.join(', ')}</span>}
                {own && <span class="keymap-chip is-mine">{t('keymap.mine')}</span>}
              </span>
              <span class="keymap-actions">
                {own && (
                  <button class="keymap-act" onClick={() => save(personalKeymap.restore(mine, one.command))}>
                    {t('keymap.restore')}
                  </button>
                )}
                <button class="keymap-act" onClick={() => save(personalKeymap.drop(mine, layout, one))}>
                  {t('keymap.drop')}
                </button>
              </span>
              {open && (
                <Chord
                  plugin={plugin}
                  title={t('keymap.rebind')}
                  binding={one}
                  onCancel={() => setEditing(null)}
                  onDone={(next) => {
                    setEditing(null);
                    save(personalKeymap.rebind(mine, layout, one, next));
                  }}
                />
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div class="keymap-empty">{t('keymap.nothing')}</div>}
      </div>
    </div>
  );
}

function Chord({
  plugin,
  title,
  binding,
  onDone,
  onCancel,
}: {
  plugin: KeymapPlugin;
  title: string;
  binding: KeyBinding | null;
  onDone: (next: KeyBinding) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ide = useIde();
  const trap = useRef<HTMLDivElement>(null);
  const [chord, setChord] = useState(binding?.key ?? '');
  const [command, setCommand] = useState(binding?.command ?? '');
  const [picking, setPicking] = useState(binding === null);
  const echo = plugin.keys.echo.value;
  const caught = useRef<string | null>(null);

  useEffect(() => {
    trap.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!echo || echo.context !== 'keymap-edit' || echo.key === caught.current) return;
    caught.current = echo.key;
    setChord(echo.key);
  }, [echo]);

  const commands = ide.knownCommands.value;
  const matches = useMemo(() => {
    const needle = command.trim().toLowerCase();
    const all = commands.filter(
      (one) => one.id.toLowerCase().includes(needle) || commandLabel(t, one.id).toLowerCase().includes(needle),
    );
    return all.slice(0, 8);
  }, [commands, command, t]);

  const ready = chord !== '' && commands.some((one) => one.id === command);

  return (
    <div class="keymap-catch">
      <div class="keymap-catch-title">{title}</div>
      <div class="keymap-catch-row">
        <div class="keymap-trap" ref={trap} tabIndex={0} data-keys="keymap-edit">
          {chord ? <kbd class="keymap-kbd is-big">{plugin.keys.humanize(chord)}</kbd> : t('keymap.press')}
        </div>
        <Keyboard chord={chord} />
      </div>

      <div class="keymap-catch-row">
        <input
          class="field keymap-command-input"
          placeholder={t('keymap.command')}
          value={command}
          spellcheck={false}
          onFocus={() => setPicking(true)}
          onInput={(event) => {
            setCommand((event.target as HTMLInputElement).value);
            setPicking(true);
          }}
        />
        <button class="button" disabled={!ready} onClick={() => ready && onDone(bindingOf(binding, chord, command))}>
          {t('keymap.apply')}
        </button>
        <button class="button" onClick={onCancel}>
          {t('keymap.cancel')}
        </button>
      </div>

      {picking && matches.length > 0 && (
        <div class="keymap-picks">
          {matches.map((one) => (
            <button
              class={`keymap-pick ${one.id === command ? 'is-on' : ''}`}
              key={one.id}
              onClick={() => {
                setCommand(one.id);
                setPicking(false);
              }}
            >
              <span class="keymap-pick-name">{commandLabel(t, one.id)}</span>
              <span class="keymap-chip">{one.id}</span>
              <span class="keymap-pick-about">{one.about}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function bindingOf(was: KeyBinding | null, key: string, command: string): KeyBinding {
  return {
    command,
    key: keymapRules.normalizeKey(key),
    ...(was?.when ? { when: was.when } : {}),
    ...(was?.where ? { where: was.where } : {}),
  };
}

function commandLabel(t: IdeServices['t'], id: string): string {
  const said = t(`command.${id}`);
  return said === `command.${id}` ? id : said;
}
