/**
 * A place the caret has been. Our own type rather than the protocol's: the history is
 * the plugin's business, and the core does not read it.
 */
export interface Visit {
  path: string;
  line: number;
  /**
   * The column (zero-based). Optional: histories written before columns existed lie on
   * disks without it, and they have to be read as they are — "the start of the line".
   */
  character?: number;
}
