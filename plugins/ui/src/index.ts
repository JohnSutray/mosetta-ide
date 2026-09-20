/**
 * `@mosetta/ide-plugin-ui` — the IDE's widgets, and it is a PLUGIN.
 *
 * A window frame, a list with a search field, a menu, a choice window, a resizer, a
 * tooltip, icons. The core draws none of them; plugins import them under this name, and
 * the build substitutes what THIS plugin provided. It can be turned off — and then
 * there is nobody to draw the windows, which is said out loud rather than by emptiness.
 *
 * The windows' state is here too, as the `UiPlugin.windows` field: the stack, the
 * tooltip, the sizes, the active list and menu. The core turned out to have not one
 * question of its own about windows, and the separate package existed only so that the
 * core and this plugin imported the same thing.
 */

export { Popup } from './popup.js';
export { PickPopup, grouped, matches, type PickItem, type PickProps } from './pick-popup.js';
export { ChoicePopup, type ChoiceRow, type ChoiceProps } from './choice-popup.js';
export { Menu, type MenuItem } from './menu.js';
export { AskPopup } from './ask-popup.js';
export { Asking, type Ask } from './asking.js';
export { Typeahead, type TypeaheadList } from './typeahead.js';
export { ModeSwitch, type ModeOption } from './mode-switch.js';
export { Chip, ChipRow, Tag } from './chip.js';
export { Resizer } from './resizer.js';
export { Tip } from './tip.js';
export { fuzzy, Fuzzy, type FuzzyHit } from './fuzzy.js';
export { Icon, type IconName } from './icons.js';
export { FileIcon, DirIcon, RootIcon, Chevron } from './file-icons.js';
export { fileTypes, type FileType } from './file-types.js';
export { Windows, type KeyCapture } from './windows/windows.js';
export { Popups, type OpenPopup } from './windows/popups.js';
export { Tips, type TipBox, type TipSpot } from './windows/tips.js';
export { Geometry, type Size, type Remember } from './windows/geometry.js';
export type { PickApi } from './windows/pick.js';
export type { MenuApi } from './windows/menu-state.js';
