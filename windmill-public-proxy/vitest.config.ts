import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.toml" },
			miniflare: {
				// The workerd binary bundled with the installed
				// @cloudflare/vitest-pool-workers lags behind wrangler.toml's
				// compatibility_date; cap it to what this binary supports.
				compatibilityDate: "2026-08-22",
				bindings: {
					CF_ACCESS_CLIENT_ID: "test-client-id",
					CF_ACCESS_CLIENT_SECRET: "test-client-secret",
					WINDMILL_TOKEN: "test-token",
					APP_SECRETS_JSON: JSON.stringify({ "cost-claims": "test-secret" }),
				},
			},
		}),
	],
});
