
/**
 * The open list-with-search.
 *
 * One module listens to the keyboard, so the arrows and Enter arrive as commands. The
 * commands do not know which list is open — they call whatever is registered here.
 *
 * There is exactly one list: two such popups do not happen at once, and if one day they
 * do, the upper will overwrite the lower, exactly as in the popup stack.
 */

export interface PickApi {
  next(): void;
  prev(): void;
  accept(): void;
  /**
   * Unfold an item's actions, if it has any. Branches have a menu, scripts have no
   * actions — and the right arrow simply does nothing there.
   */
  expand?(): void;
}
