# ide.mosetta.org

The website: a landing page with the real Mosetta client embedded in it, a full-screen
playground at `/play/`, and the screenshots and videos the plugins' READMEs show.

The IDE on these pages is not a recording. It is the client from `client/`, mounted into
an element of an ordinary page with `mount()`, talking to a daemon that the page itself
plays (`src/demo/`): files and git state in memory, the plugins' own search index and
grep, a pretend shell, and plain refusals for whatever needs a real machine. This page is
also the test of embedding — its own styles, its own buttons, and the IDE inside a `div`.

| Command | What it does |
|---|---|
| `pnpm dev` | Snapshot the plugins from a real daemon, then serve the site on :5190. |
| `pnpm snapshot` | Build every plugin with the real server, on an empty config, into `public/demo/daemon.json`. |
| `pnpm media` | Record the READMEs' screenshots and videos from `/play/` with Chrome and ffmpeg, into `public/media/`. `pnpm media tree search` records only those scenes. |
| `pnpm build` | Snapshot, then build into `dist/`. |
| `pnpm deploy` | Build and deploy to Cloudflare Workers as static assets on `ide.mosetta.org`. Run `pnpm media` first: the media are not in git. |
| `pnpm test` | The demo daemon's tests. |

`?trace` in the address prints every call the client makes to the demo daemon, and its
answer.
