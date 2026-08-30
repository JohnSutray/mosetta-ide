export function EditorIcon(filled: boolean) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        fill={filled ? 'currentColor' : 'none'}
        opacity={filled ? 0.22 : 1}
        stroke="currentColor"
      />
      <path
        d="M4 6h5M4 8.5h7M4 11h3"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
  );
}
