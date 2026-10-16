# Remote Desktop — startup preview

## New desktop + relay architecture

Phone browser → HTTPS relay → outbound WSS desktop companion → local Codex + configured Computer Use. MongoDB on the relay persists accounts, paired devices, chats, events and Codex thread mappings. The phone needs no VPN or desktop software. The computer must remain on and connected.

The Electron Mac companion supports folder selection, a five-minute single-use six-digit pairing code, encrypted OS credential storage, reconnect and local disconnect. Tasks are not replayed after a disconnect or process crash. Pairing persists across restarts. App permissions belong to the Computer Use backend; persistent consent is available only when that backend offers it. Pairing does not bypass OS or tool permissions.

### Local development

```sh
npm ci
npm run mongo:local
# in another terminal
npm run build
npm run relay
# in another terminal
npm run desktop
```

If mongod is missing, first use `npm run mongo:install` as described below. Open http://127.0.0.1:3200/remote, create a local test account, set http://127.0.0.1:3200 in the development desktop app, select a test folder and enter its code in the phone UI. Development HTTP is restricted to loopback; packaged desktop builds require HTTPS. Defaults: MongoDB mongodb://127.0.0.1:27017, relay database remote_mac_relay. Existing legacy local chats remain in remote_mac and are not automatically assigned to cloud accounts.

### Packaging and deployment

`npm run desktop:pack` creates an unsigned Apple Silicon .app in outputs/desktop/mac-arm64. It is a preview, not a signed/notarized release. Windows packaging configuration is present, but Windows execution and Computer Use are unverified. The desktop bundle excludes server/database dependencies.

See deploy/README.md for prepared Docker Compose, Caddy TLS, private authenticated MongoDB and relay deployment. No hosting or domain has been provisioned. Docker and cross-network access have not been tested here.

The real inference engine still requires the user's locally installed, signed-in Codex and configured Computer Use MCP. These components are not bundled as redistributable startup infrastructure. Before public launch, complete identity recovery/verification, signed updates, Windows support, security review and operational monitoring. TLS protects transport; relay and database can read chat content.

### Verification

`npm run typecheck`, `npm test`, `npm run relay:test`, `npm run test:mongo`, `npm run build`, and `npm run desktop:pack` passed. Mongo integration tests require local MongoDB. Relay integration uses real HTTP/WebSocket/Mongo with an explicitly simulated executor; separately, the native desktop and phone UI completed a real Codex `cua.getState()` task and retained the chat after browser reload.

---

## Legacy local-only companion

# Remote Mac — Codex + Computer Use + MongoDB

Phone browser → authenticated Node companion on your Mac → Codex app-server → the Mac's configured Computer Use MCP. Saved chats and execution history live in **real local MongoDB**. No mock inference or mock database is used in the running app.

## Start on this Mac

Requires Node 24+, a signed-in Codex CLI, and the locally configured `cua_repl` Computer Use MCP. macOS may require Screen Recording and Accessibility permissions. That MCP is supplied by the desktop app and is not bundled in the source archive.

```sh
npm ci
npm run mongo:install
npm run mongo:local
```

Keep MongoDB running in that terminal. `mongo:install` uses Python 3 to download MongoDB 8.0 Community for macOS from its official release metadata, verifies the vendor's SHA-256, and puts only mongod in `.remote-mac/bin`. It makes no system-wide installation. Alternatively install MongoDB Community yourself and set MONGOD_BIN to its binary. `mongo:local` starts a persistent local instance bound only to **127.0.0.1:27017**, with data in `.remote-mac/mongodb` and logs in `.remote-mac/mongodb.log`. This single-user prototype uses loopback isolation, not database user authentication. Never proxy or expose that port. MongoDB is not automatically installed as a login/boot service.

In a second terminal:

```sh
npm run build
TEST_FOLDER="/absolute/path/to/test-folder" PORT=3100 npm start
```

Default database connection: `mongodb://127.0.0.1:27017`, database `remote_mac`. Override with MONGODB_URI / MONGODB_DATABASE on the Mac if necessary; never put the connection string in browser code or send credentials through chat. Startup fails if MongoDB is unavailable; it never silently falls back to SQLite.

## Pair once

Open the Mac pairing screen at http://127.0.0.1:3101 (main port + 1; configurable with MAC_PANEL_PORT). Enter its six-digit, single-use code in the phone interface. The code lasts five minutes and locks after ten guesses. The Mac screen can generate another code, list paired devices, and revoke all devices while stopping the current task. It is a local web panel, not a packaged native Mac app.

Pairing stays exactly as before: token hashes are stored atomically in `.remote-mac/paired-devices.json` (directory 0700, file 0600); raw tokens are not stored there. A persistent HttpOnly, SameSite=Strict cookie remains on the phone and is Secure with HTTPS. Its 400-day lifetime rolls during use. Restarting the Mac/companion does not require pairing again; clearing browser data, expiry after long inactivity, or explicit revocation does. Set PAIRING_STATE_FILE to change the local trust-file location. Pairing is separate from Computer Use app permissions and from chat storage.

## Phone far from the Mac

The phone can be on mobile data or another network, but **the current localhost URL is not a remote-access URL**. A private HTTPS/VPN endpoint must first be configured for the companion. The startup relay described above replaces the VPN approach. This repository has not provisioned or tested a VPN, TLS certificate, public tunnel, or physical remote phone connection.

Keep Node on loopback and forward only the phone port, 3100. Set APP_ORIGIN to the exact HTTPS origin used by the phone. Forward normal HTTP and SSE and preserve Origin headers. Do not forward the local Mac panel (3101), MongoDB (27017), Codex, or MCP transports.

```sh
APP_ORIGIN="https://your-private-mac-host" TEST_FOLDER="/absolute/test-folder" PORT=3100 npm start
```

The Mac and phone need internet connectivity, MongoDB and the companion must be running, and the Mac must be awake/available for its computer tools. Pairing alone does not wake a sleeping/offline Mac or enable locked desktop access. Private VPN setup and any required OS unlock permissions are separate.

## Saved chats

MongoDB collections `chats`, `jobs`, and `events` store conversation titles, user requests, assistant replies, progress, approval-request history, statuses and persistent Codex thread IDs. Unique indexes protect record IDs. Ordered writes keep events and thread mappings in sequence. Database write failure aborts the active task instead of claiming durable history.

The phone has a saved chat list, New chat, messages, execution details and continuation through `thread/resume`. Refreshing the phone restores the selected chat and current activity. Closing the phone does not stop an active Mac task. After a companion restart, unfinished jobs are marked interrupted; stale approval callbacks are discarded and GUI actions are **never automatically replayed**. Review the last result and explicitly send a follow-up to continue. Browser handles themselves are reacquired by the agent.

This is one personal Mac owner: every paired phone shares that owner's conversations. There are no separate multi-user accounts yet. Every history/streaming endpoint requires authentication. Data is local plaintext, not application-encrypted storage. Revoking pairing removes access but does not erase history. Provider/Codex credentials remain in Codex's local credential store, outside MongoDB.

### Migrate existing SQLite chats

Stop the companion, leave MongoDB running, then run:

```sh
npm run migrate:mongo
```

This additively imports `.remote-mac/chats.sqlite` (override CHAT_DATABASE_FILE for another source) with idempotent upserts, retaining conversation IDs and Codex thread mappings. It does not overwrite existing MongoDB records or delete/change the SQLite source. The running app no longer uses SQLite; `companion/sqlite-legacy.ts` exists only for legacy tests. Source archives exclude all database files and credentials. Pre-database in-memory chats cannot be recovered.

## Agent and approvals

The companion passes the original natural-language request to `codex app-server --listen stdio://` over private stdio, with initialization, persistent thread creation/resume, turn/start, streamed MCP activity/replies, turn completion and turn/interrupt. The only configured MCP is the locally supplied computer integration. Shell tools, web search, app connectors and subagents are disabled.

Examples: `افتح كروم`, `افتح البريد الإلكتروني بدون إرسال أي رسالة`, `رتّب الملفات في دوسي التجربة حسب النوع`.

Computer mode can operate accessible apps outside TEST_FOLDER; that folder is a working directory, not a GUI sandbox. Codex requests explicit confirmation for destructive operations, message sending and sensitive changes. The phone relays agent questions, individual command/file approvals and supported MCP consent forms. When the native backend offers it, “Always allow this app” forwards native `_meta.persist=always`, so approved app access is remembered. Revoke it in desktop Settings → Computer Use → Always allow. App access is separate from confirmation for sensitive actions. Unknown requests and filesystem/network permission expansion fail closed.

GUI consent enforcement depends on the agent/computer backend, not a deterministic filesystem firewall. This is a personal prototype. Stop interrupts the turn and terminates its child; it cannot undo completed actions or guarantee cancellation of an already-dispatched GUI action. No Claude Code integration, screenshot streaming, native phone app, or automatic OS setup is included.

`REMOTE_MODE=files` preserves the original restricted file planner: list root files, create one folder, organize by extension; deletion and overwrite disabled. It records chat history in MongoDB but has no persistent agent context. Computer mode retains Codex context.

## Checks

Start MongoDB before the real integration checks:

```sh
npm test
npm run test:mongo
npm run test:pairing
npm run typecheck
npm run build
```

`test:mongo` uses real MongoDB and a unique disposable test database, testing restoration, ordered events, thread mappings and interruption recovery. Standard tests label simulated app-server protocol tests and skip the dedicated MongoDB test unless MONGODB_TEST_URI is supplied. The HTTP smoke test runs real companion restarts against a separate MongoDB test database and verifies pairing, authenticated chat restoration and revocation. `scripts/smoke.ts` is the original real-inference file workflow test.

Official references checked: https://learn.chatgpt.com/docs/app-server , https://learn.chatgpt.com/docs/computer-use , https://www.mongodb.com/docs/drivers/node/current/connect/connection-targets/ .
