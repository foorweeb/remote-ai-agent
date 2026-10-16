# Single-server deployment preview

Prepared deployment source; **not deployed or Docker-tested in this workspace** (Docker is unavailable). Use a Linux server with Docker Compose and a domain whose DNS points to that server. Only Caddy's 80/443 are exposed. MongoDB and relay stay on the private Compose network; no Mac inbound ports are required.

1. Copy `config.example` to `.env` in this directory. Set DOMAIN. Generate two different strong hex passwords, for example with `openssl rand -hex 32`. Do not commit/share `.env`.
2. Run `docker compose --env-file .env up -d --build` from this directory.
3. Open `https://YOUR_DOMAIN/remote`. Create a test account. Set the same HTTPS origin (without /remote) in the desktop app, choose a folder, and request a pairing code. Enter the code on the phone.
4. Verify an unpaired request to `/api/cloud/status` returns 401, desktop outbound WSS connects, and Stop/prompt/history work from mobile data before onboarding users.

Caddy obtains TLS certificates; DNS and reachable ports 80/443 must be correct. Back up MongoDB and test restoration. MongoDB's initialization user script runs only for a new data volume; password changes need an explicit database user rotation, not just editing `.env`.

This is one relay process with in-memory connections, active-turn locks and rate limiting. Do not add multiple replicas without shared routing/leases and distributed throttling. Restart disconnects agents, interrupts jobs and never automatically replays actions. Central MongoDB stores account/device/chat metadata and results; the relay sees command content. This is TLS transport encryption, not end-to-end encrypted storage.

Before a paid/public launch: verify email and add password recovery, establish account/session/device administration and abuse controls, sign/notarize desktop builds, provide a signed update channel, audit Computer Use consent and dependency redistribution, complete Windows testing, add monitoring/backups/security review, and add local disconnect/kill controls. There is no email delivery or billing integration yet. Current inference uses the user's existing locally signed-in Codex and configured MCP; those tools are not redistributable components supplied by this prototype.
