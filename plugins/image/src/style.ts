/** The viewer's own styling. */
export const STYLE = `
.image-host { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }

.image-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 4px 8px;
  border-bottom: 1px solid var(--divider);
  background: var(--panel-bg);
  font: 11px var(--ui-font);
  color: var(--muted);
}
.image-facts { display: flex; align-items: center; gap: 10px; margin-left: auto; white-space: nowrap; overflow: hidden; }
.image-kind { color: var(--fg); opacity: 0.7; }
.image-warn { color: #be9117; }
.image-colors { display: flex; align-items: center; gap: 8px; }
.image-color { display: flex; align-items: center; gap: 4px; }
.image-color i {
  display: block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 1px solid var(--divider);
}

.image-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--divider);
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
}
.image-tool:hover { background: var(--control-bg-hover); color: var(--fg); }
.image-tool.is-on { background: var(--treesel); color: #dbe6ef; border-color: var(--treesel); }

.image-split { display: flex; flex: 1; min-height: 0; }
.image-text { flex: 1; min-width: 0; border-right: 1px solid var(--divider); }
.image-split .image-canvas { flex: 1; min-width: 0; }

.image-canvas {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.image-canvas.is-checker {
  background-color: #3c3f41;
  background-image:
    linear-gradient(45deg, #45494a 25%, transparent 25%),
    linear-gradient(-45deg, #45494a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #45494a 75%),
    linear-gradient(-45deg, transparent 75%, #45494a 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.image-canvas.is-dark { background: #1e1f22; }
.image-canvas.is-light { background: #f2f2f2; }

.image-shown { image-rendering: auto; }
.image-shown.is-fit { max-width: 100%; max-height: 100%; object-fit: contain; }

.image-canvas.is-stale { position: relative; }
.image-canvas.is-stale .image-shown { opacity: 0.35; }
.image-note {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--panel-bg);
  border: 1px solid var(--divider);
  color: #be9117;
  font: 11px var(--ui-font);
  white-space: nowrap;
}

.image-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 20px;
  color: var(--muted);
  font: 12px var(--ui-font);
  text-align: center;
}
`;
