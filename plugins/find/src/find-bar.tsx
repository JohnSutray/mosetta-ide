import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useIde, useT } from '@mosetta/ide-api/client';
import type { Windows } from '@mosetta/ide-plugin-ui';
import type { FindState } from './find.js';

interface ToolProps {
  keysFor: (command: string) => string[];
  windows: Windows;
  command: string;
  title: string;
  on?: boolean;
  children: ComponentChildren;
}

function Tool({ keysFor, windows, command, title, on, children }: ToolProps) {
  const ide = useIde();
  const t = useT();
  return (
    <button
      type="button"
      class={`find-tool ${on ? 'is-on' : ''}`}
      onMouseEnter={(event) => windows.tips.show(event.currentTarget as Element, t(title), keysFor(command))}
      onMouseLeave={() => windows.tips.hide()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        windows.tips.hide();
        ide.runCommand(command);
      }}
    >
      {children}
    </button>
  );
}

export function FindBar({ keysFor, windows, find }: { keysFor: (command: string) => string[]; windows: Windows; find: FindState }) {
  const t = useT();
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const epoch = find.focusEpoch.value;
  const multiline = find.multiline.value;

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    if (multiline) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, [epoch, multiline]);

  const replace = find.mode.value === 'replace';
  const count = find.count.value;
  const bad = !find.valid.value;
  const none = count !== null && count.total === 0;
  const counter = bad
    ? t('find.badPattern')
    : count === null
      ? ''
      : none
        ? t('find.none')
        : count.current
          ? `${count.current}/${count.total}`
          : String(count.total);

  const fieldProps = {
    class: 'field find-field',
    placeholder: t('find.placeholder'),
    value: find.term.value,
    spellcheck: false,
    onInput: (event: Event) => find.setTerm((event.currentTarget as HTMLInputElement).value),
  };

  return (
    <div class="find-bar">
      <div class="find-row" data-keys="find">
        <Tool keysFor={keysFor} windows={windows} command={replace ? 'find.open' : 'find.replace'} title={replace ? 'find.hideReplace' : 'find.showReplace'}>
          {replace ? '▾' : '▸'}
        </Tool>
        {multiline ? (
          <textarea ref={field as never} rows={3} data-keys="find-multiline" {...fieldProps} />
        ) : (
          <input ref={field as never} {...fieldProps} />
        )}
        <Tool keysFor={keysFor} windows={windows} command="find.toggleCase" title="find.case" on={find.caseSensitive.value}>
          Cc
        </Tool>
        <Tool keysFor={keysFor} windows={windows} command="find.toggleWords" title="find.words" on={find.words.value}>
          W
        </Tool>
        <Tool keysFor={keysFor} windows={windows} command="find.toggleRegex" title="find.regex" on={find.regex.value}>
          .*
        </Tool>
        <span class={`find-count ${none || bad ? 'is-none' : ''}`}>{counter}</span>
        <Tool keysFor={keysFor} windows={windows} command="find.prev" title="find.prev">
          ↑
        </Tool>
        <Tool keysFor={keysFor} windows={windows} command="find.next" title="find.next">
          ↓
        </Tool>
        <Tool keysFor={keysFor} windows={windows} command="find.newline" title="find.newline" on={multiline}>
          ⏎
        </Tool>
        <Tool keysFor={keysFor} windows={windows} command="find.close" title="find.close">
          ×
        </Tool>
      </div>
      {replace && (
        <div class="find-row" data-keys="find-replace">
          <span class="find-spacer" />
          <input
            class="field find-field"
            placeholder={t('find.replacePlaceholder')}
            value={find.replacement.value}
            spellcheck={false}
            onInput={(event) => find.setReplacement(event.currentTarget.value)}
          />
          <Tool keysFor={keysFor} windows={windows} command="find.replaceOne" title="find.replaceOne">
            {t('find.replaceOne')}
          </Tool>
          <Tool keysFor={keysFor} windows={windows} command="find.replaceAll" title="find.replaceAll">
            {t('find.replaceAll')}
          </Tool>
        </div>
      )}
    </div>
  );
}
