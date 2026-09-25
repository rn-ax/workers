# rn-workers

Cloudflare Workers for the rn.ax suite. One directory per worker, each with its own `wrangler.toml` and independent deploy.

| Worker | Purpose |
|---|---|
| `windmill-mail-router` | Routes inbound email (via Cloudflare Email Routing on rutinerad.com) to Windmill flows/scripts based on the recipient address. |
| `windmill-public-proxy` | Public HTTP proxy (`wm.rn.ax`) that forwards to Windmill's sync job-run API, attaching the Cloudflare Access service-token bypass and Windmill's own bearer auth — lets a Windmill flow serve a stable public URL (e.g. a live-built RSS/JSON feed) without exposing `windmill.rn.ax` itself. |

## Deploying

Each worker directory is deployed independently:

```
cd <worker-name>
CLOUDFLARE_API_TOKEN=<token> wrangler deploy
```

Secrets (`WINDMILL_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, etc.) are set per-worker via `wrangler secret put <NAME>` and are not stored in this repo.
