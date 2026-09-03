import { useEffect, useRef } from 'preact/hooks';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, lineNumbers } from '@codemirror/view';
import type { EditorSettings } from '@ide/protocol';
import { darcula } from '@ide/code';
import { languages } from '@ide/code';
import type { Choice, Region } from '../merge/diff3.js';
import { layout, type Lane, type LaneLayout } from '../merge/layout.js';
import { i18n } from '../i18n/index.js';

interface Props {
  path: string;
  regions: Region[];
  choices: Choice[];
  cursor: number;
  settings: EditorSettings;
  leftLabel: string;
  rightLabel: string;
  onDecide: (at: number, side: 'left' | 'right', choice: 'take' | 'skip' | null) => void;
  onPick: (at: number) => void;
}

export function MergeColumns(props: Props) {
  const { path, regions, choices, cursor, settings } = props;
  const grid = layout(regions, choices);

  const hosts = {
    left: useRef<HTMLDivElement>(null),
    center: useRef<HTMLDivElement>(null),
    right: useRef<HTMLDivElement>(null),
  };
  const views = useRef<Partial<Record<Lane, EditorView>>>({});
  const rails = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const made: Partial<Record<Lane, EditorView>> = {};
    for (const lane of LANES) {
      const host = hosts[lane].current;
      if (!host) continue;
      made[lane] = new EditorView({
        state: EditorState.create({
          doc: '',
          extensions: paneExtensions(path, settings),
        }),
        parent: host,
      });
    }
    views.current = made;

    void document.fonts?.ready.then(() => measureLine());

    const scrollers = LANES.map((lane) => made[lane]?.scrollDOM).filter(Boolean) as HTMLElement[];
    let syncing = false;
    const sync = (from: HTMLElement) => () => {
      if (syncing) return;
      syncing = true;
      for (const other of scrollers) {
        if (other !== from) other.scrollTop = from.scrollTop;
      }
      if (rails.current) rails.current.scrollTop = from.scrollTop;
      syncing = false;
    };
    const offs = scrollers.map((scroller) => {
      const handler = sync(scroller);
      scroller.addEventListener('scroll', handler, { passive: true });
      return () => scroller.removeEventListener('scroll', handler);
    });

    return () => {
      for (const off of offs) off();
      for (const lane of LANES) made[lane]?.destroy();
      views.current = {};
    };
  }, [path, settings.fontSize, settings.fontFamily]);

  useEffect(() => {
    for (const lane of LANES) {
      const view = views.current[lane];
      if (!view) continue;
      const want = grid[lane];
      const changes =
        view.state.doc.toString() === want.text
          ? undefined
          : { from: 0, to: view.state.doc.length, insert: want.text };
      view.dispatch({
        ...(changes ? { changes } : {}),
        effects: setLane.of({ lane, layout: want, regions, choices, cursor }),
      });
    }
    measureLine();
  }, [grid.center.text, grid.left.text, grid.right.text, choices, cursor, regions]);

  function measureLine(): void {
    const host = wrap.current;
    const view = views.current.center ?? views.current.left ?? views.current.right;
    if (!host || !view) return;
    const lines = view.contentDOM.getElementsByClassName('cm-line');
    const first = lines[0]?.getBoundingClientRect().height ?? 0;
    const line = first > 0 ? first : view.defaultLineHeight;
    if (line > 0) host.style.setProperty('--merge-line', `${line}px`);
  }

  return (
    <div class="merge-columns" ref={wrap}>
      <Column label={props.leftLabel} host={hosts.left} side="left" />
      <Rail
        rails={rails}
        side="left"
        grid={grid}
        regions={regions}
        choices={choices}
        cursor={cursor}
        onDecide={props.onDecide}
        onPick={props.onPick}
      />
      <Column label={i18n.t('merge.column.result')} host={hosts.center} side="center" />
      <Rail
        side="right"
        grid={grid}
        regions={regions}
        choices={choices}
        cursor={cursor}
        onDecide={props.onDecide}
        onPick={props.onPick}
      />
      <Column label={props.rightLabel} host={hosts.right} side="right" />
    </div>
  );
}

const LANES: Lane[] = ['left', 'center', 'right'];

function Column({
  label,
  host,
  side,
}: {
  label: string;
  host: { current: HTMLDivElement | null };
  side: Lane;
}) {
  return (
    <div class={`merge-column is-${side}`}>
      <div class="merge-column-title">{label}</div>
      <div class="merge-pane" ref={host} />
    </div>
  );
}

function Rail({
  rails,
  side,
  grid,
  regions,
  choices,
  cursor,
  onDecide,
  onPick,
}: {
  rails?: { current: HTMLDivElement | null };
  side: 'left' | 'right';
  grid: ReturnType<typeof layout>;
  regions: Region[];
  choices: Choice[];
  cursor: number;
  onDecide: Props['onDecide'];
  onPick: Props['onPick'];
}) {
  return (
    <div class={`merge-rail is-${side}`}>
      <div class="merge-column-title" />
      <div class="merge-rail-scroll" ref={rails as never}>
        <div class="merge-rail-body" style={{ height: `calc(var(--merge-line) * ${grid.rows})` }}>
          {grid.spots.map((spot) => {
            const region = regions[spot.region];
            const choice = choices[spot.region];
            if (!region || !choice) return null;
            if (region.kind === 'same') return null;
            if (region.kind === 'left' && side === 'right') return null;
            if (region.kind === 'right' && side === 'left') return null;

            const taken = choice[side] === 'take';
            const skipped = choice[side] === 'skip';
            const arrow = side === 'left' ? '→' : '←';
            return (
              <div
                key={spot.region}
                class={`merge-marks ${spot.region === cursor ? 'is-current' : ''}`}
                style={{ top: `calc(var(--merge-line) * ${spot.top})` }}
                onMouseDown={() => onPick(spot.region)}
              >
                <button
                  type="button"
                  class={`merge-mark is-take ${taken ? 'is-on' : ''}`}
                  title={i18n.t('merge.take')}
                  onClick={() => onDecide(spot.region, side, taken ? null : 'take')}
                >
                  {arrow}
                </button>
                <button
                  type="button"
                  class={`merge-mark is-skip ${skipped ? 'is-on' : ''}`}
                  title={i18n.t('merge.skip')}
                  onClick={() => onDecide(spot.region, side, skipped ? null : 'skip')}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface LaneState {
  lane: Lane;
  layout: LaneLayout;
  regions: Region[];
  choices: Choice[];
  cursor: number;
}

const setLane = StateEffect.define<LaneState>();

const laneField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLane)) return decorate(tr.state, effect.value);
    }
    return value.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

class Spacer extends WidgetType {
  constructor(private readonly rows: number) {
    super();
  }
  override eq(other: Spacer): boolean {
    return other.rows === this.rows;
  }
  toDOM(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'merge-spacer';
    box.style.height = `calc(var(--merge-line) * ${this.rows})`;
    return box;
  }
  override get estimatedHeight(): number {
    return -1;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

function decorate(state: EditorState, lane: LaneState) {
  const marks: Array<{ from: number; deco: ReturnType<typeof Decoration.line> }> = [];

  for (const band of lane.layout.bands) {
    const region = lane.regions[band.region];
    const choice = lane.choices[band.region];
    if (!region || !choice || region.kind === 'same') continue;
    const classes = ['merge-line', `is-${region.kind}`];
    if (band.region === lane.cursor) classes.push('is-current');
    if (lane.lane !== 'center') {
      const said = choice[lane.lane === 'left' ? 'left' : 'right'];
      if (said === 'skip') classes.push('is-skipped');
      if (said === 'take') classes.push('is-taken');
    }
    if (region.kind === 'conflict' && (choice.left === null || choice.right === null)) {
      classes.push('is-open');
    }
    const deco = Decoration.line({ class: classes.join(' ') });
    for (let row = 0; row < band.rows; row += 1) {
      const at = band.from + row;
      if (at >= state.doc.lines) break;
      marks.push({ from: state.doc.line(at + 1).from, deco });
    }
  }

  const spacers = lane.layout.pads.map((padding) => {
    const at =
      padding.line < 0
        ? 0
        : state.doc.line(Math.min(padding.line + 1, state.doc.lines)).to;
    return {
      from: at,
      deco: Decoration.widget({
        widget: new Spacer(padding.rows),
        block: true,
        side: padding.line < 0 ? -1 : 1,
      }),
    };
  });

  return Decoration.set(
    [...marks, ...spacers].map((item) => item.deco.range(item.from)),
    true,
  );
}

function paneExtensions(path: string, settings: EditorSettings): Extension[] {
  return [
    lineNumbers(),
    languages.of(path),
    darcula.extension,
    laneField,
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    EditorView.theme({
      '&': { fontSize: `${settings.fontSize}px`, height: '100%' },
      '.cm-content': darcula.textStyle(settings),
      '.cm-scroller': { overflow: 'auto' },
    }),
  ];
}
