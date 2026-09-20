import { cellsOf, SHEEP_BODY, SHEEP_H, SHEEP_LEGS, SHEEP_W } from './sheep-art.js';

/**
 * The side of a sprite cell in pixels. Twelve rather than eight: on an empty screen a
 * sixty-pixel sheep gets lost, and not everyone manages to make out a sheep in it —
 * while the splash lives half a second.
 */
const PX = 12;

/**
 * The startup splash.
 *
 * The mascot sheep: an interface should have a FACE, and ours already has one — the
 * very sheep that grazes in an empty editor panel. Showing it at startup is more honest
 * than anything else: a person recognises the program before it has managed to draw
 * itself.
 *
 * There is not ONE word of text, and that is not laziness. The plugins' dictionary has
 * not been poured in at that moment (it travels with the plugins), and the chosen
 * language may not be the one underneath: any label here risks flashing a key instead
 * of a word. A sprite needs no translation.
 *
 * The legs march in place, in two phases, as they do in the pen. Both phases are drawn
 * at once and swapped by opacity, so the step goes in FRAMES rather than as a smooth
 * transition, and the sheep stays eight-bit.
 */
export function Splash({ leaving }: { leaving: boolean }) {
  const body = cellsOf(SHEEP_BODY);
  const legs = SHEEP_LEGS.map((phase) => cellsOf([phase], SHEEP_BODY.length));
  return (
    <div class={`splash ${leaving ? 'is-leaving' : ''}`} aria-hidden="true">
      <svg
        class="splash-sheep"
        width={SHEEP_W * PX}
        height={SHEEP_H * PX}
        viewBox={`0 0 ${SHEEP_W} ${SHEEP_H}`}
        shape-rendering="crispEdges"
      >
        {body.map((cell) => (
          <rect key={`b${cell.x},${cell.y}`} x={cell.x} y={cell.y} width={1} height={1} fill={cell.color} />
        ))}
        {legs.map((phase, at) => (
          <g key={`l${at}`} class={`splash-legs splash-legs-${at}`}>
            {phase.map((cell) => (
              <rect key={`${cell.x},${cell.y}`} x={cell.x} y={cell.y} width={1} height={1} fill={cell.color} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
