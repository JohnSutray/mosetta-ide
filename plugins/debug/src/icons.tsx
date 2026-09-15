import type { JSX } from 'preact';

const frame = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

export function BugIcon(filled: boolean): JSX.Element {
  return (
    <svg {...frame}>
      <path d="M5.5 7.5a2.5 2.5 0 0 1 5 0v3a2.5 2.5 0 0 1-5 0z" fill={filled ? 'currentColor' : 'none'} />
      <path d="M6 5.2a2 2 0 0 1 4 0" />
      <path d="M3 8.5h2.5M10.5 8.5H13M3.5 12l2-1.2M12.5 12l-2-1.2M4 5.5l1.8 1.2M12 5.5l-1.8 1.2" />
    </svg>
  );
}

export function ContinueIcon(): JSX.Element {
  return (
    <svg {...frame}>
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon(): JSX.Element {
  return (
    <svg {...frame}>
      <path d="M5.5 3.5v9M10.5 3.5v9" stroke-width="2" />
    </svg>
  );
}

export function StopIcon(): JSX.Element {
  return (
    <svg {...frame}>
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}

export function StepOverIcon(): JSX.Element {
  return (
    <svg {...frame}>
      <path d="M3 9.5a5 5 0 0 1 9-2.8" />
      <path d="M12.2 3.6l.2 3.4-3.3-.4" />
      <circle cx="8" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StepIntoIcon(): JSX.Element {
  return (
    <svg {...frame}>
      <path d="M8 2.5v6.5M5.2 6.5L8 9.3l2.8-2.8" />
      <circle cx="8" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StepOutIcon(): JSX.Element {
  return (
    <svg {...frame}>
      <path d="M8 9V2.5M5.2 5.3L8 2.5l2.8 2.8" />
      <circle cx="8" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Arrow({ open }: { open: boolean }): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
      <path d="M3 1.5l4 3.5-4 3.5z" />
    </svg>
  );
}
