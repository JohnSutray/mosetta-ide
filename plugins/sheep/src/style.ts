/**
 * The pasture fills the whole panel.
 *
 * `absolute` from its parent: the canvas has to know its size in pixels rather than
 * stretch like rubber — otherwise the cells stop landing on physical pixels and a seam
 * appears at the junctions.
 */
export const STYLE = `
.sheep-field { position: absolute; inset: 0; width: 100%; height: 100%; }

.empty-editor {
  position: relative;
  height: 100%;
  overflow: hidden;
  cursor: default;
}
`;
