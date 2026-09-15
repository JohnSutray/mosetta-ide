import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { ComponentChildren } from 'preact';
import { useIde, useT } from '@mosetta/ide-api/client';
import type CodePlugin from '@mosetta/ide-plugin-code';
import { EDITOR_DEFAULTS } from '@mosetta/ide-plugin-code';
import { Popup } from '@mosetta/ide-plugin-ui';
import type { Windows } from '@mosetta/ide-plugin-ui';
import type { MaskChips } from './chips.js';
import type { FilesField, FindFiles } from './files.js';
import type { HitLine, HitParts } from './hit-line.js';
import { ReplaceIcon } from './icons.js';

interface ToolProps {
  keysFor: (command: string) => string[];
  windows: Windows;
  command: string;
  title: string;
  on?: boolean;
  disabled?: boolean;
  children: ComponentChildren;
}

function Tool({ keysFor, windows, command, title, on, disabled, children }: ToolProps) {
  const ide = useIde();
  const t = useT();
  return (
    <button
      type="button"
      class={`find-tool ${on ? 'is-on' : ''}`}
      disabled={disabled}
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

export function FindFilesPopup({
  keysFor,
  windows,
  files,
  code,
  line,
}: {
  keysFor: (command: string) => string[];
  windows: Windows;
  files: FindFiles;
  code: CodePlugin;
  line: HitLine;
}) {
  const ide = useIde();
  const t = useT();
  const query = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLInputElement>(null);
  const mask = useRef<HTMLInputElement>(null);
  const exclude = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focus = files.focus.value;

  useEffect(() => {
    if (!files.open.value) return;
    const target =
      focus.field === 'replace'
        ? replace
        : focus.field === 'mask'
          ? mask
          : focus.field === 'exclude'
            ? exclude
            : query;
    target.current?.focus();
    if (focus.field !== 'mask' && focus.field !== 'exclude') target.current?.select();
  }, [files.open.value, focus]);

  useEffect(() => {
    list.current?.querySelector('.fif-row.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [files.selected.value, files.hits.value]);

  const editor = ide.settingsOf('editor', EDITOR_DEFAULTS).value;
  if (!files.open.value) return null;

  const preview = files.preview.value;
  const replacing = files.mode.value === 'replace';
  const total = files.hits.value.length;
  const report = files.report.value;

  return (
    <Popup windows={windows} id="find-files" keys="find-files" class="fif" size={{ w: 1100, h: 640 }} min={{ w: 560, h: 320 }} onClose={() => files.close()}>
      <div class="fif-head">
        <div class="fif-row">
          <span class="fif-icon">⌕</span>
          <input
            ref={query}
            class="fif-input"
            style={{ width: `${width(files.query.value, 36)}ch` }}
            value={files.query.value}
            spellcheck={false}
            placeholder={t('findFiles.placeholder')}
            onFocus={() => files.focusOn('query')}
            onInput={(event) => files.setQuery(event.currentTarget.value)}
          />
          <span class="fif-tools">
            <Tool keysFor={keysFor} windows={windows} command="findFiles.toggleCase" title="find.case" on={files.caseSensitive.value}>
              Cc
            </Tool>
            <Tool keysFor={keysFor} windows={windows} command="findFiles.toggleWords" title="find.words" on={files.words.value}>
              W
            </Tool>
            <Tool keysFor={keysFor} windows={windows} command="findFiles.toggleRegex" title="find.regex" on={files.regex.value}>
              .*
            </Tool>
            <Tool
              keysFor={keysFor}
              windows={windows}
              command={replacing ? 'find.files' : 'find.filesReplace'}
              title={replacing ? 'find.hideReplace' : 'find.showReplace'}
              on={replacing}
            >
              <ReplaceIcon />
            </Tool>
          </span>
          <span class={`fif-count ${files.busy.value ? 'is-busy' : ''}`}>
            {files.query.value === ''
              ? ''
              : `${total}${files.truncated.value ? '+' : ''} ${t('findFiles.results')} · ${files.files.value} ${t('findFiles.files')}`}
          </span>
        </div>
        {replacing && (
          <div class="fif-row">
            <span class="fif-icon">⇄</span>
            <input
              ref={replace}
              class="fif-input"
              style={{ width: `${width(files.replacement.value, 36)}ch` }}
              value={files.replacement.value}
              spellcheck={false}
              placeholder={t('find.replacePlaceholder')}
              onFocus={() => files.focusOn('replace')}
              onInput={(event) => files.setReplacement(event.currentTarget.value)}
            />
            <Tool keysFor={keysFor} windows={windows} command="findFiles.replaceFile" title="findFiles.replaceFile" disabled={total === 0}>
              {t('findFiles.replaceFile')}
            </Tool>
            <Tool keysFor={keysFor} windows={windows} command="findFiles.replaceAll" title="findFiles.replaceAll" disabled={total === 0}>
              {t('findFiles.replaceAll')}
            </Tool>
          </div>
        )}
        <ChipRow
          field="mask"
          chips={files.masks}
          input={mask}
          files={files}
          keysFor={keysFor}
          windows={windows}
          placeholder={t('findFiles.mask')}
          tip={t('findFiles.maskTip')}
        />
        <ChipRow
          field="exclude"
          chips={files.excludes}
          input={exclude}
          files={files}
          keysFor={keysFor}
          windows={windows}
          placeholder={t('findFiles.exclude')}
          tip={t('findFiles.excludeTip')}
          struck
          note={files.skipped.value > 0 ? t('findFiles.skipped', { count: files.skipped.value }) : ''}
        />
      </div>

      <div class="fif-body">
        <div class="fif-list" ref={list}>
          {files.rows.value.map((row, i) =>
            'header' in row ? (
              <div class="fif-section" key={`h${i}`}>
                <span class="fif-section-path">{row.header}</span>
                <span class="fif-section-count">{row.count}</span>
              </div>
            ) : (
              <Row
                key={`${row.hit.path}:${row.hit.line}:${row.hit.from}`}
                parts={line.of(row.hit)}
                number={row.hit.line + 1}
                current={row.at === files.selected.value}
                onPick={() => files.selectAt(row.at)}
                onOpen={() => files.accept()}
              />
            ),
          )}
          {total === 0 && files.query.value !== '' && !files.busy.value && <div class="fif-empty">{t('findFiles.empty')}</div>}
          {files.truncated.value && <div class="fif-note">{t('findFiles.truncated')}</div>}
          {report && (
            <div class="fif-note">
              {t('findFiles.replaced')} {report.replaced} · {report.files} {t('findFiles.files')}
            </div>
          )}
        </div>
        <div class="fif-preview">
          {preview ? (
            <code.View key={preview.path} path={preview.path} text={preview.text} line={preview.line} settings={editor} />
          ) : (
            <div class="fif-empty">{t('findFiles.preview')}</div>
          )}
        </div>
      </div>
    </Popup>
  );
}

function width(value: string, least: number): number {
  return Math.min(88, Math.max(least, value.length + 1));
}

function Row({
  parts,
  number,
  current,
  onPick,
  onOpen,
}: {
  parts: HitParts;
  number: number;
  current: boolean;
  onPick: () => void;
  onOpen: () => void;
}) {
  return (
    <div class={`fif-row-hit ${current ? 'is-current' : ''} fif-row`} onMouseMove={current ? undefined : onPick} onClick={onOpen}>
      <span class="fif-line">{number}</span>
      <span class="fif-text">
        {parts.cut && '…'}
        {parts.pieces.map((piece, i) => (
          <span key={i} class={piece.match ? 'fif-match' : undefined} style={piece.color ? { color: piece.color } : undefined}>
            {piece.text}
          </span>
        ))}
      </span>
    </div>
  );
}

function ChipRow({
  field,
  chips,
  files,
  input,
  keysFor,
  windows,
  placeholder,
  tip,
  struck,
  note,
}: {
  field: FilesField;
  chips: MaskChips;
  files: FindFiles;
  input: RefObject<HTMLInputElement>;
  keysFor: (command: string) => string[];
  windows: Windows;
  placeholder: string;
  tip: string;
  struck?: boolean;
  note?: string;
}) {
  return (
    <div class={`fif-row fif-masks ${struck ? 'is-excluding' : ''}`} data-keys="find-files-mask">
      {chips.all.value.map((one) => (
        <span class={`fif-chip ${chips.isOff(one) ? 'is-off' : 'is-on'}`} key={one}>
          <button type="button" class="fif-chip-name" onMouseDown={(event) => event.preventDefault()} onClick={() => chips.toggle(one)}>
            {one}
          </button>
          <button type="button" class="fif-chip-close" onMouseDown={(event) => event.preventDefault()} onClick={() => chips.remove(one)}>
            ×
          </button>
        </span>
      ))}
      <input
        ref={input}
        class="fif-mask"
        style={{ width: `${width(chips.draft.value, 7)}ch` }}
        value={chips.draft.value}
        spellcheck={false}
        placeholder={placeholder}
        onMouseEnter={(event) => windows.tips.show(event.currentTarget as Element, tip, keysFor('findFiles.addMask'))}
        onMouseLeave={() => windows.tips.hide()}
        onFocus={() => files.focusOn(field)}
        onInput={(event) => (chips.draft.value = event.currentTarget.value)}
      />
      {note ? <span class="fif-skipped">{note}</span> : null}
    </div>
  );
}
