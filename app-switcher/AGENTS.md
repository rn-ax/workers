# app-switcher

Cloudflare Worker that injects the app-switcher bar into the HTML of each listed `*.rn.ax` app.

## Adding an app

Add an `{ name, host }` entry to `APPS` in `src/index.ts`. The `wrangler.toml` routes are wildcards (`*.rn.ax/*` plus the bare apex `rn.ax/*`), so a new host needs no route change; the worker passes every host that is not in `APPS` through untouched, and routes take precedence over Custom Domains, so workers such as `rater` and `windmill-public-proxy` keep working through that passthrough.

`APPS` stays in alphabetical order by display name (case-insensitive), so a new app goes into its sorted position. The bar also sorts `APPS` by name at render time, so the displayed order is alphabetical on its own; the sorted source keeps reviews and diffs predictable.

A host qualifies once its HTML renders with the bar in place: the bar is `position: fixed` at the top, and the offset script moves top-pinned elements below it. Check each new app's header visually after the deploy.

The host must be an Access-gated hostname proxied through Cloudflare on the `rn.ax` zone; the worker runs after Access and only ever sees authenticated requests.

## Deploy

Merging to `main` runs the tests (`npm test`) and deploys through the repo's `deploy.yml` matrix.
