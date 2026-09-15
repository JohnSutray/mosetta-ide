import { useT } from '@mosetta/ide-api/client';
import type { EditorSettings } from '@mosetta/ide-plugin-code';
import type CodePlugin from '@mosetta/ide-plugin-code';
import { useEffect, useState } from 'preact/hooks';
import type { Foreign } from './state.js';

export const FOREIGN_PREFIX = 'debug:';

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
