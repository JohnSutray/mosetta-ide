
/**
 * The open dropdown menu.
 *
 * The same role the active list plays for search lists: the arrow and Enter commands do
 * not know which menu is open — they call whatever is registered here. There is exactly
 * one menu: two at once do not happen.
 */
export interface MenuApi {
  next(): void;
  prev(): void;
  accept(): void;
}
