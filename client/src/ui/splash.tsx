import { cellsOf, SHEEP_BODY, SHEEP_H, SHEEP_LEGS, SHEEP_W } from './sheep-art.js';

const PX = 12;

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
