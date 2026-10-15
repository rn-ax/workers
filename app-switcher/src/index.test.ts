import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

const ME = "me@example.com";
const testEnv = { SWITCHER_EMAIL: ME };

// A request as Access forwards it: carrying the authenticated user's email.
function asUser(url: string, email: string = ME) {
	return new Request(url, { headers: { "Cf-Access-Authenticated-User-Email": email } });
}

function stubFetch(response: Response) {
	const fetchMock = vi.fn(async () => response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("app-switcher", () => {
	it("shows the bar only to the configured Access user", async () => {
		const html = "<html><head></head><body><h1>Radarr</h1></body></html>";
		stubFetch(new Response(html, { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://radarr.rn.ax/", "someone@example.com"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(await response.text()).toBe(html);
	});

	it("shows no bar when no user is configured", async () => {
		const html = "<html><head></head><body><h1>Radarr</h1></body></html>";
		stubFetch(new Response(html, { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://radarr.rn.ax/"), {}, ctx);
		await waitOnExecutionContext(ctx);

		expect(await response.text()).toBe(html);
	});

	it("matches the configured user regardless of letter case", async () => {
		stubFetch(new Response("<html><head></head><body></body></html>", { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://radarr.rn.ax/", "ME@Example.com"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(await response.text()).toContain('id="rn-app-switcher"');
	});

	it("identifies the user from the Access JWT when the email header is absent", async () => {
		stubFetch(new Response("<html><head></head><body></body></html>", { headers: { "content-type": "text/html" } }));
		const payload = btoa(JSON.stringify({ email: ME })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

		const ctx = createExecutionContext();
		const request = new Request("https://radarr.rn.ax/", { headers: { "Cf-Access-Jwt-Assertion": `h.${payload}.s` } });
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(await response.text()).toContain('id="rn-app-switcher"');
	});

	it("passes hosts that are not listed in APPS through untouched", async () => {
		const fetchMock = stubFetch(
			new Response("<html><head></head><body><h1>Rater</h1></body></html>", {
				headers: { "content-type": "text/html; charset=utf-8" },
			})
		);

		const ctx = createExecutionContext();
		const request = asUser("https://rater.rn.ax/");
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(await response.text()).toBe("<html><head></head><body><h1>Rater</h1></body></html>");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(request);
	});

	it("leaves non-HTML responses untouched", async () => {
		stubFetch(new Response('{"ok":true}', { headers: { "content-type": "application/json" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://radarr.rn.ax/api/v3/movie"), testEnv, ctx);
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
		const response = await worker.fetch(asUser("https://radarr.rn.ax/"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toContain('<div style="position:fixed');
		expect(body).toContain(">Radarr<");
		expect(body).toContain(">Sonarr<");
		expect(body.indexOf("<h1>Radarr</h1>")).toBeGreaterThan(body.indexOf("</div>"));
	});

	it("measures the bar and offsets top-pinned elements below it", async () => {
		stubFetch(
			new Response("<html><head></head><body><header>x</header></body></html>", {
				headers: { "content-type": "text/html" },
			})
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://radarr.rn.ax/"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toContain('id="rn-app-switcher"');
		expect(body).toContain("--rn-bar-h");
		expect(body).toContain("padding-top:var(--rn-bar-h,");
		expect(body).toContain('getComputedStyle(el)');
	});

	it("hides the bar's horizontal scrollbar", async () => {
		stubFetch(new Response("<html><head></head><body></body></html>", { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://radarr.rn.ax/"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toContain("scrollbar-width:none");
		expect(body).toContain("#rn-app-switcher::-webkit-scrollbar{display:none}");
	});

	it("lists Overseerr's successor as Seerr", async () => {
		stubFetch(new Response("<html><body></body></html>", { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://ovr.rn.ax/"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toMatch(/href="https:\/\/ovr\.rn\.ax\/"[^>]*>Seerr</);
		expect(body).not.toContain(">Overseerr<");
	});

	it("marks the current app's link as active", async () => {
		stubFetch(new Response("<html><body></body></html>", { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://sonarr.rn.ax/"), testEnv, ctx);
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
		const response = await worker.fetch(asUser("https://radarr.rn.ax/"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.headers.get("content-security-policy")).toBeNull();
	});

	it("escapes app names when rendering links", async () => {
		stubFetch(new Response("<html><body></body></html>", { headers: { "content-type": "text/html" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(asUser("https://radarr.rn.ax/"), testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		// The only script is the offset script; no app name is rendered as markup.
		expect(body.match(/<script>/g)).toHaveLength(1);
	});
});
