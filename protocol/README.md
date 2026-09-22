# Protocol

**`@mosetta/ide-protocol`** · The wire between the Mosetta IDE and its daemon: every RPC method and event, as types.

The tab and the daemon talk JSON-RPC 2.0 over one WebSocket. This package is the
complete list of what may travel on it — `Api` for the methods, `Events` for what the
daemon sends unasked — plus the shapes of files, documents, workspaces and settings.
The front end has no filesystem of its own, so anything the interface needs has to be
here.

The methods are grouped by layer, and the grouping is a rule rather than a style:
`fs.*` is the disk, `tree.*` and `doc.*` are the daemon's memory, `workspace.*` and
`config.*` belong to the daemon itself, and `plugins.*` carries plugins' own calls and
events without the core knowing what is inside.

Plugin authors rarely need it directly: the contract, `@mosetta/ide-api`, hands the same
wire over as typed services.
