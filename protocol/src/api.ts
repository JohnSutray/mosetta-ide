import type { ConfigBundle, SettingScope, SettingValue } from './config.js';
import type { PluginInfo } from './plugins.js';
import type {
  DirEntry,
  EntryKind,
  DocState,
  DocVersion,
  FileText,
  IndexStats,
  LogLine,
  WorkspaceId,
  WorkspaceInfo,
  WriteResult,
} from './data.js';

/**
 * The API surface. A namespace is a layer, and that is not cosmetic:
 *
 *   fs.*     the OS layer. Disk directly, past every cache. The truth.
 *   tree.*   the memory layer, directory tree. Read from RAM, never touches disk.
 *   doc.*    the memory layer, documents. What the editor works with.
 *
 * A method that would need two layers at once is a sign the layers have
 * drifted, not a reason to add such a method.
 *
 * Project methods do NOT take a workspace id: it comes from the session.
 * Switching projects changes the place we read from, nothing else.
 */
export interface Api {
  /**
   * Heartbeat, and the daemon's report about itself.
   *
   * The client asks every fifteen seconds whether the server is alive anyway,
   * and "how much am I holding" is the same kind of knowledge — a second poll
   * for it would mean knocking on the same door twice.
   */
  'server.ping': {
    params: null;
    result: {
      uptimeMs: number;
      pid: number;
      /** What the daemon itself holds, in MB: Node knows this exactly. */
      rssMb: number;
      /**
       * What its CHILDREN hold, excluding itself: language servers, terminals,
       * git. `null` means this system cannot be measured.
       *
       * A separate number rather than a sum: "how much do we cost" and "how
       * much does what we started cost" are different questions, which is
       * exactly why they sit side by side on the toolbar badge.
       */
      kidsMb: number | null;
    };
  };

  'config.get': { params: null; result: ConfigBundle };

  'workspace.open': { params: { root: string }; result: WorkspaceInfo };
  'workspace.attach': { params: { id: WorkspaceId }; result: WorkspaceInfo };
  'workspace.detach': { params: null; result: null };
  'workspace.list': { params: null; result: WorkspaceInfo[] };
  'workspace.current': { params: null; result: WorkspaceInfo | null };
  'workspace.close': { params: { id: WorkspaceId }; result: null };
  /**
   * Write one setting. The only place where the server WRITES to a config file:
   * the edit is surgical, so the comments around the value survive it.
   */
  'config.set': {
    params: { section: string; key: string; value: SettingValue; scope?: SettingScope };
    result: { section: string; key: string; value: SettingValue };
  };
  /**
   * Reset to factory: the key leaves the files. BOTH files — the user's and the
   * project's — because "factory" means the value is nowhere, otherwise the
   * scope slider in the settings window would be lying.
   */
  'config.reset': {
    params: { section: string; key: string };
    result: { section: string; key: string };
  };

  'fs.list': { params: { path: string }; result: DirEntry[] };
  'fs.read': { params: { path: string }; result: FileText };
  'fs.write': {
    params: { path: string; text: string; expectedRevision?: string | null };
    result: WriteResult;
  };

  /**
   * File and directory operations. They live in the OS layer: this is the truth
   * about disk, not about memory. Memory hears about them from the watcher, by
   * the same route as about edits made outside — which is why there is not a
   * single special case here.
   */
  'fs.create': { params: { path: string; kind: EntryKind }; result: DirEntry };
  'fs.move': { params: { from: string; to: string }; result: DirEntry };
  'fs.copy': { params: { from: string; to: string }; result: DirEntry };
  'fs.remove': { params: { path: string }; result: null };
  /** Bytes as base64 — an image from the clipboard, a font, anything. */
  'fs.writeBytes': { params: { path: string; base64: string }; result: DirEntry };
  /**
   * Read bytes — the THIRD layer of reading a file.
   *
   * The first layer is which files exist at all (the tree), the second is text,
   * read eagerly because it is nearly free. An image is not text and does not
   * live in memory: it is asked for when someone is ABOUT TO LOOK at it, and we
   * hand it over past memory, through the OS layer.
   *
   * The ceiling travels with the question: a gigabyte file must not turn into a
   * gigabyte of base64 on its way to the tab.
   */
  'fs.bytes': {
    params: { path: string; limit?: number };
    result: { path: string; base64: string; bytes: number; truncated: boolean };
  };
  /** The absolute path — for "copy path". */
  'fs.absolute': { params: { path: string }; result: { path: string } };

  'tree.list': { params: { path: string }; result: DirEntry[] };
  'tree.stats': { params: null; result: IndexStats };

  'doc.open': { params: { path: string }; result: DocState };
  'doc.edit': { params: { path: string; text: string; baseVersion: number }; result: DocVersion };
  'doc.save': { params: { path: string }; result: DocState };
  'doc.reload': { params: { path: string }; result: DocState };
  /**
   * The document's current state in memory. Opens nothing and changes nothing —
   * it exists to pick up text after an external change without bumping the open
   * counter.
   */
  'doc.state': { params: { path: string }; result: DocState };
  'doc.close': { params: { path: string }; result: null };
  /**
   * Which paths in memory have drifted from disk — the unsaved ones.
   *
   * Asked before anything that reads DISK: running a program, attaching a
   * debugger. A list rather than a count: a person is shown exactly what is
   * unsaved, and "three files" without names is the same silent truncation.
   * A dirty document outlives the tab closing the file, so the open document
   * cannot answer this — only the layer can.
   */
  'doc.unsaved': { params: null; result: { paths: string[] } };

  /** Which plugins are installed on this machine, and what became of them. */
  'plugins.list': { params: null; result: PluginInfo[] };
  /**
   * A plugin's built client code. Handed over as a STRING on the same socket
   * rather than as a file over HTTP: client and server live on different ports,
   * and standing up static serving with its headers just for this would be
   * machinery for nothing. The client turns the string into a blob and imports it.
   */
  'plugins.code': { params: { name: string }; result: { code: string } };
  /**
   * Call a method a plugin declared. The method name is the plugin's own
   * business, and the namespace is the plugin itself — two of them cannot
   * collide.
   *
   * The core stays CLOSED and typed while this exists: opening `Api` up for
   * outside extension would kill its types first. A plugin gets its strictness
   * from its own package, not from a shared union.
   */
  'plugins.call': {
    params: { name: string; method: string; params: unknown };
    result: unknown;
  };
}

export type ApiMethod = keyof Api;
export type Params<M extends ApiMethod> = Api[M]['params'];
export type Result<M extends ApiMethod> = Api[M]['result'];

export interface Events {
  'workspace.attached': WorkspaceInfo | null;
  'workspace.list': WorkspaceInfo[];
  'workspace.closed': { id: WorkspaceId };

  'config.changed': ConfigBundle;

  /** The document changed in memory — possibly not by this tab. */
  'doc.changed': DocVersion;
  /** The file changed on disk and we pulled it in: memory was clean. */
  'doc.external': { path: string; revision: string };
  /**
   * Memory has drifted from disk. A FACT, not a conflict: nobody is blocked,
   * each side simply holds its own text. The tab draws a strip above the
   * editor; the argument starts later, if some action runs into it.
   */
  'doc.diverged': { path: string; reason: 'changed' | 'removed' };
  /** A directory's contents changed: re-read the tree. */
  'tree.changed': { path: string };
  /** The file is gone from disk. If it was open, the editor stares into space. */
  'doc.removed': { path: string };
  /**
   * The file moved by OUR hands: renamed, or dragged. This is the same document
   * under a new path rather than "vanished and appeared" — edits held in memory
   * survive the move.
   */
  'doc.moved': { from: string; path: string };

  /**
   * A plugin's own event, opaque to the core.
   *
   * An envelope rather than one row per event in this table: the core has no
   * business knowing that `term.data` exists, since otherwise every new plugin
   * would be a change to the protocol. The plugin name rides in the envelope so
   * that two plugins may name an event alike without silently sharing it.
   */
  'plugins.event': { name: string; event: string; payload: unknown };

  log: LogLine;
}

export type EventName = keyof Events;
export type EventPayload<E extends EventName> = Events[E];
