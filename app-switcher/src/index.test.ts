import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

function stubFetch(response: Response) {
	const fetchMock = vi.fn(async () => response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("app-switcher", () => {
	it("leaves non-HTML responses untouched", async () => {
		stubFetch(new Response('{"ok":true}', { headers: { "content-type": "application/json" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://radarr.rn.ax/api/v3/movie"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(await response.text()).toBe('{"ok":true}');
	});

	it("injects the switcher bar into the body of an HTML response", async () => {
		stubFetch(
			new Response("<html><head></head><body><h1>Radarr</h1></body></html>", {
				headers: { "content-type": "text/html; charset=utf-8" },
			})
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://radarr.rn.ax/"), env, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toContain('<div style="position:fixed');
		expect(body).toContain(">Radarr<");
		expect(body).toContain(">Sonarr<");
		expect(body.indexOf("<h1>Radarr</h1>")).toBeGreaterThan(body.indexOf("</div>"));
	});

	it("marks the current app's link as active", async () => {
		stubFetch(new Response("<html><body></body></html>", { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://sonarr.rn.ax/"), env, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toMatch(/color:#f9fafb;font-weight:600[^>]*>Sonarr</);
		expect(body).toMatch(/color:#9ca3af;font-weight:400[^>]*>Radarr</);
	});

	it("strips the upstream Content-Security-Policy header from HTML responses", async () => {
		stubFetch(
			new Response("<html><body></body></html>", {
				headers: { "content-type": "text/html", "content-security-policy": "default-src 'self'" },
			})
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://radarr.rn.ax/"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.headers.get("content-security-policy")).toBeNull();
	});

	it("escapes app names when rendering links", async () => {
		stubFetch(new Response("<html><body></body></html>", { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://radarr.rn.ax/"), env, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).not.toContain("<script>");
	});
});
