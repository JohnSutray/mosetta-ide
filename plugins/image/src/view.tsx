import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ModeSwitch, type Windows } from '@mosetta/ide-plugin-ui';
import type { Signal } from '@preact/signals';
import { ImageKinds } from './kinds.js';
import { SvgReader } from './svg-facts.js';
import type { ImageStore } from './state.js';
import { CheckerIcon, ContrastIcon, FitIcon, PictureIcon, SplitIcon, TextIcon } from './icons.js';

export type Ground = 'checker' | 'dark' | 'light';
export type SvgMode = 'text' | 'both' | 'view';

const kinds = new ImageKinds();
const reader = new SvgReader();

type Say = (key: string, params?: Record<string, string | number>) => string;

/**
 * The strip above the view: what is controlled, and what is known.
 *
 * The facts about the file stand HERE rather than as a caption under the picture: their
 * place is fixed, and the eye finds them without re-reading. Switches on the left,
 * details on the right: the canvas size, the weight, everything else.
 */
function Bar({
  windows,
  ground,
  fit,
  facts,
  left,
  t,
}: {
  windows: Windows;
  ground: Signal<Ground>;
  fit: Signal<boolean> | null;
  facts: ComponentChildren;
  left?: ComponentChildren;
  t: Say;
}) {
  return (
    <div class="image-bar">
      {left}
      <ModeSwitch
        windows={windows}
        value={ground.value}
        options={[
          { id: 'checker' as Ground, icon: <CheckerIcon />, tip: t('image.ground.checker') },
          { id: 'dark' as Ground, icon: <ContrastIcon />, tip: t('image.ground.dark') },
        ]}
        onPick={(id) => (ground.value = ground.value === id ? 'light' : id)}
      />
      {fit ? (
        <button
          type="button"
          class={`image-tool ${fit.value ? 'is-on' : ''}`}
          onMouseEnter={(event) => windows.tips.show(event.currentTarget as Element, t(fit.value ? 'image.fit.on' : 'image.fit.off'))}
          onMouseLeave={() => windows.tips.hide()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            windows.tips.hide();
            fit.value = !fit.value;
          }}
        >
          <FitIcon />
        </button>
      ) : null}
      <span class="image-facts">{facts}</span>
    </div>
  );
}

/**
 * A raster image.
 *
 * The size in pixels is asked OF THE BROWSER rather than parsed out of the file's
 * header: it decodes the image anyway, and `naturalWidth` is the same answer without us
 * parsing eight formats.
 */
export function RasterView({
  path,
  store,
  windows,
  ground,
  fit,
  t,
}: {
  path: string;
  store: ImageStore;
  windows: Windows;
  ground: Signal<Ground>;
  fit: Signal<boolean>;
  t: Say;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setSize(null);
    store.load(path);
  }, [path]);

  const shown = store.shown.value;
  if (shown?.error) return <div class="image-empty">{t('image.failed', { why: shown.error })}</div>;

  return (
    <div class="image-host">
      <Bar
        windows={windows}
        ground={ground}
        fit={fit}
        t={t}
        facts={
          <>
            {size ? <span>{t('image.size', { w: size.w, h: size.h })}</span> : null}
            <span>{kinds.size(shown?.bytes ?? 0)}</span>
            <span class="image-kind">{kinds.extension(path).toUpperCase()}</span>
            {shown?.truncated ? <span class="image-warn">{t('image.truncated')}</span> : null}
          </>
        }
      />
      <div class={`image-canvas is-${ground.value}`}>
        {shown?.url ? (
          <img
            class={`image-shown ${fit.value ? 'is-fit' : ''}`}
            onLoad={(event) => {
              const img = event.currentTarget;
              setSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            src={shown.url}
            alt={path}
          />
        ) : (
          <div class="image-empty">{t('image.loading')}</div>
        )}
      </div>
    </div>
  );
}

/**
 * SVG, an image made of text.
 *
 * Which is why it gets both views at once: the text in a real editor on the left, what
 * came out of it on the right. The mode is as in WebStorm: "text", "text and view",
 * "view".
 *
 * It is drawn through a `data:` URL in an `<img>` rather than by inserting the markup
 * into the page. The difference is not cosmetic: SVG can do scripts and external
 * references, and an `<img>` runs neither. A file in a project is data, and it has to
 * be treated as data.
 */
export function SvgView({
  path,
  text,
  windows,
  ground,
  mode,
  editor,
  t,
}: {
  path: string;
  text: string;
  windows: Windows;
  ground: Signal<Ground>;
  mode: Signal<SvgMode>;
  editor: () => unknown;
  t: Say;
}) {
  const facts = reader.facts(text);
  const url = `data:image/svg+xml;base64,${base64(text)}`;
  const showText = mode.value !== 'view';
  const showPicture = mode.value !== 'text';
  const [good, setGood] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const broken = failed === url;
  const shown = broken ? good : url;

  return (
    <div class="image-host">
      <Bar
        windows={windows}
        ground={ground}
        fit={null}
        t={t}
        left={
          <ModeSwitch
            windows={windows}
            value={mode.value}
            options={[
              { id: 'text' as SvgMode, icon: <TextIcon />, tip: t('image.mode.text') },
              { id: 'both' as SvgMode, icon: <SplitIcon />, tip: t('image.mode.both') },
              { id: 'view' as SvgMode, icon: <PictureIcon />, tip: t('image.mode.view') },
            ]}
            onPick={(id) => (mode.value = id)}
          />
        }
        facts={
          <>
            {facts.box ? <span>{t('image.size', { w: facts.box.width, h: facts.box.height })}</span> : <span class="image-warn">{t('image.noBox')}</span>}
            {facts.width ? <span>{t('image.declared', { w: facts.width, h: facts.height ?? '?' })}</span> : null}
            <span>{t('image.shapes', { count: facts.shapes })}</span>
            <span>{kinds.size(new TextEncoder().encode(text).length)}</span>
            {facts.colors.length > 0 ? (
              <span class="image-colors">
                {facts.colors.map((one) => (
                  <span key={one} class="image-color">
                    <i style={{ background: one === 'currentColor' ? 'var(--fg)' : one }} />
                    {one}
                  </span>
                ))}
              </span>
            ) : null}
          </>
        }
      />
      <div class="image-split">
        {showText ? <div class="image-text">{editor() as never}</div> : null}
        {showPicture ? (
          <div class={`image-canvas is-${ground.value} ${broken ? 'is-stale' : ''}`}>
            {shown ? (
              <img
                class="image-shown is-fit"
                onLoad={(event) => {
                  if ((event.currentTarget as HTMLImageElement).src === url) setGood(url);
                }}
                onError={() => setFailed(url)}
                src={shown}
                alt={path}
              />
            ) : null}
            {broken ? <div class="image-note">{t(good ? 'image.stale' : 'image.broken')}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Text to base64 with non-Latin support: `btoa` does not survive it. */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
