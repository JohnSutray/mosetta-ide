import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useIde, useT } from '@mosetta/ide-api/client';
import type { IdeServices } from '@mosetta/ide-api/client';
import { HostIcon, OsIcon, RevertIcon, TrashIcon } from './icons.jsx';
import { scopes } from './scopes.js';
import { keymapOrder } from './order.js';
import { Keyboard } from './keyboard.jsx';
import { personalKeymap } from './personal.js';
import { keymapRules } from './rules.js';
import type KeymapPlugin from './client.jsx';
import type { KeyBinding, KeyContext, KeyHost, Keymap, KeyOs, KeyScope, TipsLike } from './types.js';

/**
 * The layout editor — the section's OWN editor.
 *
 * The settings window can do a "key — field" row, and for a layout that is meaningless:
 * its value is a list of chords with contexts and environments. So the section brings
 * its own screen, and the window draws it.
 *
 * What is here besides the list: a KEYBOARD (you see what is held down rather than only
 * the string `meta+shift+s`) and a hint about commands — the id, the caption from the
 * dictionary and the description from the manifest. Assigning a key to a command that
 * does not exist is not offered to the human.
 */
export function KeymapEditor({ plugin }: { plugin: KeymapPlugin }) {
  const ide = useIde();
  const t = useT();
  const tips = plugin.tips;
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<KeyBinding | null>(null);
  const [adding, setAdding] = useState(false);

  const layout = plugin.layout.value;
  const mine = plugin.personal.value;

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const found = layout.bindings.filter((one) => {
      if (!needle) return true;
      const label = t(`command.${one.command}`).toLowerCase();
      return (
        one.key.toLowerCase().includes(needle) ||
        one.command.toLowerCase().includes(needle) ||
        label.includes(needle)
      );
    });
    return keymapOrder.sort(found);
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

      {personalKeymap.removed(mine).length > 0 && (
        <div class="keymap-rows is-gone">
          {personalKeymap.removed(mine).map((one) => (
            <div class="keymap-row is-gone" key={`gone:${keymapRules.slotOf(one)}`}>
              <span class="keymap-chord">
                <span class="chevron is-hidden">
                  <Chevron />
                </span>
                <kbd class="keymap-kbd is-dead">{plugin.keys.humanize(one.key)}</kbd>
              </span>
              <span class="keymap-command">{commandLabel(t, one.command)}</span>
              <Surface when={one.when} />
              <Where where={one.where} tips={tips} />
              <span class="keymap-tags">
                <span class="keymap-chip is-mine">{t('keymap.removed')}</span>
              </span>
              <span class="keymap-actions">
                <Act
                  tips={tips}
                  title={t('keymap.restore')}
                  onClick={() => save(personalKeymap.restore(mine, one.command))}
                >
                  <RevertIcon />
                </Act>
              </span>
            </div>
          ))}
        </div>
      )}

      <div class="keymap-rows">
        <div class="keymap-row is-head">
          <span class="keymap-chord">{t('keymap.colKey')}</span>
          <span class="keymap-command">{t('keymap.colCommand')}</span>
          <span class="keymap-context">{t('keymap.when')}</span>
          <span class="keymap-where">{t('keymap.where')}</span>
          <span class="keymap-tags" />
          <span class="keymap-actions" />
        </div>
        {rows.map((one) => {
          const own = personalKeymap.isMine(mine, one);
          const open = editing !== null && keymapRules.slotOf(editing) === keymapRules.slotOf(one);
          return (
            <div
              class={`keymap-row ${own ? 'is-mine' : ''}`}
              key={`${keymapRules.slotOf(one)}:${one.command}`}
              onClick={(event) => {
                const at = event.target as HTMLElement;
                if (at.closest('.keymap-catch') || at.closest('.keymap-act')) return;
                setEditing(open ? null : one);
              }}
            >
              <span class="keymap-chord">
                <span class={`chevron ${open ? 'is-open' : ''}`}>
                  <Chevron />
                </span>
                <kbd class="keymap-kbd">{plugin.keys.humanize(one.key)}</kbd>
              </span>
              <span class="keymap-command">{commandLabel(t, one.command)}</span>
              <Surface when={one.when} />
              <Where where={one.where} tips={tips} />
              <span class="keymap-tags">{own && <span class="keymap-chip is-mine">{t('keymap.mine')}</span>}</span>
              <span class="keymap-actions">
                {own && (
                  <Act
                    tips={tips}
                    title={t('keymap.restore')}
                    onClick={() => save(personalKeymap.restore(mine, one.command))}
                  >
                    <RevertIcon />
                  </Act>
                )}
                <Act
                  tips={tips}
                  danger
                  title={t('keymap.drop')}
                  onClick={() => save(personalKeymap.drop(mine, layout, one))}
                >
                  <TrashIcon />
                </Act>
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

/**
 * A row's button is an icon rather than a word.
 *
 * The word `remove` on every row read as part of the text, and a column of twenty
 * identical words said nothing. An icon is recognised silently, while the name of the
 * action lives in OUR tip — not in the native `title`, which waits a second and is
 * drawn past the theme.
 */
function Act({
  tips,
  title,
  danger,
  onClick,
  children,
}: {
  tips: TipsLike | null;
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      class={`keymap-act ${danger ? 'is-danger' : ''}`}
      {...tipOf(tips, title)}
      onClick={() => {
        tips?.hide();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Our tip instead of the native `title` — on everything drawn as an icon. The handlers
 * are handed out loose: the elements differ (a button, a chip) while the rule for them
 * is one.
 */
function tipOf(tips: TipsLike | null, title: string) {
  if (!tips) return {};
  return {
    onMouseEnter: (event: MouseEvent) => tips.show(event.currentTarget as Element, title),
    onMouseLeave: () => tips.hide(),
  };
}

/**
 * The row's surface is a COLUMN of its own.
 *
 * The context and the environments used to stand in one cell, and the eye did not
 * separate them at all. And emptiness in place of the context meant "works everywhere"
 * — that is, the row's strongest property was shown by NOTHING. Now it is written in a
 * word.
 */
function Surface({ when }: { when?: KeyContext }) {
  const t = useT();
  return (
    <span class="keymap-context">
      {when ? (
        <span class="keymap-chip">{contextName(t, when)}</span>
      ) : (
        <span class="keymap-any">{t('keymap.anywhere')}</span>
      )}
    </span>
  );
}

/**
 * The row's environments as icons. A whole host is one icon, a part of one is an icon
 * with letters; "everywhere" is written as a WORD: an empty cell read as "unknown",
 * though it means the widest thing possible.
 */
function Where({ where, tips }: { where?: readonly KeyScope[]; tips: TipsLike | null }) {
  const t = useT();
  const parts = scopes.summary(where);
  return (
    <span class="keymap-where">
      {parts.length === 0 ? (
        <span class="keymap-any">{t('keymap.everywhere')}</span>
      ) : (
        parts.map((one) => (
          <span
            class="keymap-chip is-where"
            key={one.host}
            {...tipOf(tips, `${t(`keymap.host.${one.host}`)}: ${one.oses.map((os) => t(`keymap.os.${os}`)).join(', ')}`)}
          >
            <HostIcon host={one.host} />
            {!one.all &&
              one.oses.map((os) => (
                <span class="keymap-os" key={os}>
                  <OsIcon os={os} />
                </span>
              ))}
          </span>
        ))
      )}
    </span>
  );
}

/**
 * Catch a chord and choose a command.
 *
 * The keys are caught by the DISPATCHER rather than by a subscription of our own: the
 * surface calls itself `keymap-edit`, and the dispatcher swallows such keys without
 * running them — otherwise assigning Cmd+S would save the file along the way. What
 * exactly was pressed lies in the echo.
 */
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
  const tips = plugin.tips;
  const trap = useRef<HTMLDivElement>(null);
  const [chord, setChord] = useState(binding?.key ?? '');
  const [command, setCommand] = useState(binding?.command ?? '');
  const [listening, setListening] = useState(false);
  /** Whether the list of commands is open: only while the field holds the focus. */
  const [picking, setPicking] = useState(false);
  const [when, setWhen] = useState<KeyContext | ''>(binding?.when ?? '');
  const [cells, setCells] = useState(() => scopes.cells(binding?.where));
  const echo = plugin.keys.echo.value;
  const caught = useRef<string | null>(null);
  const picks = useRef<HTMLDivElement>(null);

  useEffect(() => {
    picks.current?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
  }, [command]);

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
    if (!needle || commands.some((one) => one.id === command.trim())) return commands;
    return commands.filter(
      (one) => one.id.toLowerCase().includes(needle) || commandLabel(t, one.id).toLowerCase().includes(needle),
    );
  }, [commands, command, t]);

  /** A finished id of an existing command in the field — or `null`. */
  const chosen = useMemo(() => {
    const id = command.trim();
    return commands.some((one) => one.id === id) ? id : null;
  }, [commands, command]);

  const ready = chord !== '' && chosen !== null && !scopes.empty(cells);

  const flip = (host: KeyHost, os: KeyOs) => {
    const own = cells[host];
    setCells({ ...cells, [host]: own.includes(os) ? own.filter((one) => one !== os) : [...own, os] });
  };

  return (
    <div class="keymap-catch">
      <div class="keymap-catch-title">{title}</div>
      <div class="keymap-catch-row">
        <div class="keymap-trap-box">
          <div
            class={`keymap-trap ${listening ? 'is-listening' : ''}`}
            ref={trap}
            tabIndex={0}
            data-keys="keymap-edit"
            onFocus={() => setListening(true)}
            onBlur={() => setListening(false)}
          >
            {chord ? <kbd class="keymap-kbd is-big">{plugin.keys.humanize(chord)}</kbd> : t('keymap.press')}
          </div>
          <span class={`keymap-hint ${listening ? 'is-listening' : ''}`}>
            {t(listening ? 'keymap.listening' : 'keymap.clickToRebind')}
          </span>
        </div>
        <Keyboard chord={chord} />
      </div>

      <div class="keymap-catch-row">
        <label class="keymap-label">{t('keymap.when')}</label>
        <select
          class="field keymap-when"
          value={when}
          onChange={(event) => setWhen((event.target as HTMLSelectElement).value as KeyContext | '')}
        >
          <option value="">{t('keymap.anywhere')}</option>
          {keymapOrder.pickable.map((one) => (
            <option key={one} value={one}>
              {contextName(t, one)}
            </option>
          ))}
        </select>

        <label class="keymap-label">{t('keymap.where')}</label>
        <div class="keymap-scopes">
          {scopes.hosts.map((host) => (
            <div class="keymap-scope-row" key={host}>
              <span class="keymap-scope-host" {...tipOf(tips, t(`keymap.host.${host}`))}>
                <HostIcon host={host} />
              </span>
              {scopes.oses.map((os) => (
                <button
                  key={os}
                  class={`keymap-scope ${cells[host].includes(os) ? 'is-on' : ''}`}
                  {...tipOf(tips, `${t(`keymap.host.${host}`)}: ${t(`keymap.os.${os}`)}`)}
                  onClick={() => flip(host, os)}
                >
                  <OsIcon os={os} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div class="keymap-catch-row">
        <div class="keymap-combo">
          <input
            class="field keymap-command-input"
            placeholder={t('keymap.command')}
            value={command}
            spellcheck={false}
            onFocus={() => setPicking(true)}
            onBlur={() => setPicking(false)}
            onInput={(event) => setCommand((event.target as HTMLInputElement).value)}
          />
          <div class="keymap-command-hint">{chosen ? commandLabel(t, chosen) : ''}</div>
          {picking && matches.length > 0 && (
            <div class="keymap-picks" ref={picks}>
              {matches.map((one) => (
                <button
                  class={`keymap-pick ${one.id === command ? 'is-on' : ''}`}
                  key={one.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setCommand(one.id)}
                >
                  <span class="keymap-pick-name">{commandLabel(t, one.id)}</span>
                  <span class="keymap-chip">{one.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          class="button"
          disabled={!ready}
          onClick={() => ready && onDone(bindingOf(chord, command, when, scopes.where(cells)))}
        >
          {t('keymap.apply')}
        </button>
        <button class="button" onClick={onCancel}>
          {t('keymap.cancel')}
        </button>
      </div>

    </div>
  );
}

/**
 * The chevron is our own rather than the widgets': the `chevron` class is a common
 * theme style, and the turn on expanding comes from it. Dragging in a dependency on the
 * widgets package — which itself depends on us for types — for the sake of one tick
 * would be a bad trade.
 */
function Chevron() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width={1.5}>
      <path d="M4.5 2.5 L8 6 L4.5 9.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/**
 * A new row: everything chosen in the box. "Everywhere" is written by the absence of
 * the key.
 */
function bindingOf(key: string, command: string, when: KeyContext | '', where?: KeyScope[]): KeyBinding {
  return {
    command,
    key: keymapRules.normalizeKey(key),
    ...(when ? { when } : {}),
    ...(where ? { where } : {}),
  };
}

/** The surface's name in words: the dictionary belongs to whoever declared the list. */
function contextName(t: IdeServices['t'], context: KeyContext): string {
  const said = t(`keymap.context.${context}`);
  return said === `keymap.context.${context}` ? context : said;
}

/**
 * The command's name in words. From the dictionary rather than from the registry: the
 * dictionary is the translated surface, a manifest's description is not. No caption —
 * we show the id, and that is visible.
 */
function commandLabel(t: IdeServices['t'], id: string): string {
  const said = t(`command.${id}`);
  return said === `command.${id}` ? id : said;
}
