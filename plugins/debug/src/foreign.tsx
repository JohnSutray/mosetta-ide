import { useT } from '@mosetta/ide-api/client';
import type { EditorSettings } from '@mosetta/ide-plugin-code';
import type CodePlugin from '@mosetta/ide-plugin-code';
import { useEffect, useState } from 'preact/hooks';
import type { Foreign } from './state.js';

/**
 * The view's name for a source beyond the root: that is how it is captioned in the
 * editor's panel.
 */
export const FOREIGN_PREFIX = 'debug:';

/**
 * A view of a file BEYOND the project's root — a tenant of the `file.view` key. A stack
 * frame can be in `~/.nvm/…/node_modules`, or not on the disk at all
 * (`<node_internals>`); such a thing does not become a document (the memory holds only
 * the project's keys, and rightly so), but it has to be shown — otherwise "step into"
 * runs into a wall.
 *
 * The same `CodeView` as everywhere: Darcula, highlighting by extension, read-only.
 * Above it — whose text this is.
 */
export function ForeignView({
  path,
  foreign,
  fetch,
  code,
  settings,
}: {
  path: string;
  foreign: Foreign | null;
  fetch: (foreign: Foreign) => Promise<string>;
  code: CodePlugin;
  settings: EditorSettings;
}) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    setFailed(null);
    if (!foreign) return;
    let alive = true;
    fetch(foreign)
      .then((got) => {
        if (alive) setText(got);
      })
      .catch((err: unknown) => {
        if (alive) setFailed(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [path, foreign?.run, foreign?.session]);

  if (!foreign) return <div class="debug-foreign-gone">{t('debug.foreign.gone')}</div>;
  const name = path.slice(FOREIGN_PREFIX.length);
  return (
    <div class="debug-foreign">
      <div class="debug-foreign-head">
        {foreign.source.kind === 'adapter' ? t('debug.foreign.adapter') : t('debug.foreign.file')}
      </div>
      <div class="debug-foreign-body">
        {failed !== null ? (
          <div class="debug-foreign-gone">{failed}</div>
        ) : text === null ? (
          <div class="debug-foreign-gone">{t('debug.foreign.loading')}</div>
        ) : (
          <code.View path={name} text={text} line={foreign.line - 1} settings={settings} />
        )}
      </div>
    </div>
  );
}
