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
			},
		}),
	],
});
