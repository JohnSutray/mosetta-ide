/**
 * The language server's types — shared by both halves of the plugin.
 *
 * They used to lie in the protocol: the core carried diagnostics, tooltips and symbol
 * locations around. Now they are known to those who need them: both halves of this
 * plugin and its neighbours — the editor, the tree, the problems panel, symbols. The
 * shared file is the one place obliged to agree.
 */

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  range: Range;
  severity: Severity;
  message: string;
  code?: string | number;
  source?: string;
}

export interface FileDiagnostics {
  path: string;
  diagnostics: Diagnostic[];
}

export type LspState = 'off' | 'starting' | 'ready' | 'failed';

export interface LspStatus {
  server: string;
  state: LspState;
  /** Why it did not come up, or what happened. */
  detail?: string;
  /** How many documents the server holds open. */
  openDocs: number;
  /**
   * The project sweep: how far it got and what it cost.
   *
   * A field of its own rather than a line in the journal: a problems panel showing
   * emptiness reads as "all is well" rather than as "we did not look at everything".
   * Until the sweep has started it is `undefined`, and the panel stays silent, because
   * it has nothing to say yet.
   */
  sweep?: LspSweep;
}

/** How the sweep ended — and why that way. */
export type SweepStop =
  /** It reached the end: everything eligible was checked. */
  | 'done'
  /** We ran into the memory budget halfway through. */
  | 'budget'
  /** The budget was not even enough for the server to bring the project up. */
  | 'baseline'
  /** We cannot measure this system's memory — we stopped by the fallback count. */
  | 'blind';

/**
 * The state of the project sweep. Live: it is updated after every batch rather than
 * only at the end — a sweep takes minutes, and the coverage can be shown all that time.
 */
export interface LspSweep {
  /** How many files the sweep has opened. */
  checked: number;
  /** How many are eligible for checking in total. */
  total: number;
  /**
   * The memory of the server's process TREE, in MB; `null` means this system cannot be
   * measured.
   */
  mb: number | null;
  /** How much of it there was before the sweep opened its first file. */
  baseMb: number | null;
  /** The ceiling from the `lsp.memoryBudgetMb` setting. */
  budgetMb: number;
  /** While the sweep is running — `null`. */
  stopped: SweepStop | null;
}

export interface HoverInfo {
  /** Markdown: the signature as code, the documentation beneath it. */
  markdown: string;
  range?: Range;
}

/** Where a symbol is declared or used. */
export interface SymbolSite {
  path: string;
  /** Zero-based, as in LSP. */
  line: number;
  character: number;
  /** A line of text to show, trimmed. */
  preview: string;
  /** An import line rather than a real usage: those are the first thing hidden. */
  isImport: boolean;
}

/**
 * A completion item's kind. LSP's numbers are folded into the names the list draws: a
 * kind's icon answers "what is this" before the name has been read.
 */
export type CompletionKind =
  | 'method'
  | 'function'
  | 'constructor'
  | 'field'
  | 'property'
  | 'variable'
  | 'constant'
  | 'class'
  | 'interface'
  | 'enum'
  | 'member'
  | 'module'
  | 'keyword'
  | 'snippet'
  | 'type'
  | 'file'
  | 'folder'
  | 'text'
  | 'other';

/** A completion item as the language server said it. */
export interface CompletionEntry {
  label: string;
  kind: CompletionKind;
  /** What to insert. */
  insert: string;
  /**
   * What to replace: tsserver's is sometimes wider than what was typed (`?.`,
   * `#private`).
   */
  range?: Range;
  /**
   * The checker's category: local, a member, global, auto-import. Crude — five or six
   * tiers — but it knows what we do not.
   */
  sortText: string;
  filterText?: string;
  /** Briefly, on the right: the type, or the module the import will come from. */
  detail?: string;
  /** The item will arrive with an import: the import line will come in `resolve`. */
  imports?: boolean;
  deprecated?: boolean;
  /** The server's raw item: `resolve` takes it back whole. */
  raw: unknown;
}

export interface CompletionAnswer {
  items: CompletionEntry[];
  /** The server asks to be re-asked on every letter. */
  incomplete: boolean;
}

export interface TextEdit {
  range: Range;
  text: string;
}

/**
 * What is read in LAZILY, for the selected item: the signature, the documentation and
 * the edits beyond the insertion. Without a second request an auto-import item would
 * insert the name and not the `import`.
 */
export interface CompletionDetails {
  detail?: string;
  documentation?: string;
  edits: TextEdit[];
}

/**
 * "Take me to the setting" — as a shape too. An import of the settings plugin would
 * make the settings window mandatory for the language server, and that is untrue: the
 * settings can be turned off while the server works.
 */
export interface RevealLike {
  reveal(query: string): void;
}
