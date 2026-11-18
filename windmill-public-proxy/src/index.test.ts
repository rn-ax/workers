import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { inboxKey } from "./index";

function stubFetch(response: Response) {
	const fetchMock = vi.fn(async () => response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("windmill-public-proxy", () => {
	it("overrides content-type to application/feed+json for feeds/* paths", async () => {
		stubFetch(new Response(JSON.stringify({ items: [] }), { headers: { "content-type": "application/json" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://wm.rn.ax/feeds/alandstidningen"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.headers.get("content-type")).toBe("application/feed+json");
	});

	it("passes through the upstream content-type for non-feed paths", async () => {
		stubFetch(new Response("hello", { headers: { "content-type": "text/plain" } }));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://wm.rn.ax/other/script"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.headers.get("content-type")).toBe("text/plain");
	});

	it("defaults to application/json when the upstream sends no content-type", async () => {
		const upstream = new Response("hello");
		upstream.headers.delete("content-type");
		stubFetch(upstream);

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://wm.rn.ax/other/script"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.headers.get("content-type")).toBe("application/json");
	});

	it("builds the Windmill run_wait_result URL and forwards the query string", async () => {
		const fetchMock = stubFetch(new Response("{}"));

		const ctx = createExecutionContext();
		await worker.fetch(new Request("https://wm.rn.ax/feeds/foo?bar=baz"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [calledUrl] = fetchMock.mock.calls[0]!;
		expect(calledUrl.toString()).toBe(
			"https://windmill.rn.ax/api/w/agent/jobs/run_wait_result/p/f/feeds/foo?bar=baz"
		);
	});

	it("attaches the Access service-token and Windmill bearer auth headers", async () => {
		const fetchMock = stubFetch(new Response("{}"));

		const ctx = createExecutionContext();
		await worker.fetch(new Request("https://wm.rn.ax/feeds/foo"), env, ctx);
		await waitOnExecutionContext(ctx);

		const [, init] = fetchMock.mock.calls[0]!;
		const headers = init!.headers as Record<string, string>;
		expect(headers["CF-Access-Client-Id"]).toBe(env.CF_ACCESS_CLIENT_ID);
		expect(headers["CF-Access-Client-Secret"]).toBe(env.CF_ACCESS_CLIENT_SECRET);
		expect(headers.Authorization).toBe(`Bearer ${env.WINDMILL_TOKEN}`);
	});

	it("does not send a body on GET but forwards it on other methods", async () => {
		const getFetch = stubFetch(new Response("{}"));
		const ctx1 = createExecutionContext();
		await worker.fetch(new Request("https://wm.rn.ax/feeds/foo"), env, ctx1);
		await waitOnExecutionContext(ctx1);
		expect(getFetch.mock.calls[0]![1]!.body).toBeUndefined();

		const postFetch = stubFetch(new Response("{}"));
		const ctx2 = createExecutionContext();
		await worker.fetch(
			new Request("https://wm.rn.ax/feeds/foo", { method: "POST", body: '{"hello":"world"}' }),
			env,
			ctx2
		);
		await waitOnExecutionContext(ctx2);
		expect(postFetch.mock.calls[0]![1]!.body).not.toBeUndefined();
	});

	it("returns a clean 404 without hitting upstream when the path is empty", async () => {
		const fetchMock = stubFetch(new Response("{}"));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://wm.rn.ax/"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(await response.json()).toEqual({ error: "not found" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("replaces Windmill's raw 404 body with a clean, generic one", async () => {
		stubFetch(
			new Response("Not found: script not found at name f/nonexistent (lib.rs:2239)", {
				status: 404,
				headers: { "content-type": "text/plain" },
			})
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://wm.rn.ax/nonexistent"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(await response.json()).toEqual({ error: "not found" });
	});

	it("redirects apps/<slug> to the app's public secret URL", async () => {
		const fetchMock = stubFetch(new Response("{}"));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://wm.rn.ax/apps/cost-claims"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("https://windmill.rn.ax/public/agent/test-secret");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns a clean 404 for an apps/<slug> not present in APP_SECRETS_JSON", async () => {
		const fetchMock = stubFetch(new Response("{}"));

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("https://wm.rn.ax/apps/nonexistent"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	describe("m/<id>", () => {
		const id = (path: string) => btoa(path).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

		it("decodes an id to the path of the file in the inbox and refuses a path that leaves it", () => {
			expect(inboxKey(id("folder/Song.m4a"))).toBe("folder/Song.m4a");
			for (const bad of ["../x.m4a", "/etc/passwd", ".downloads/x", "a//b", ""]) {
				expect(inboxKey(id(bad))).toBeNull();
			}
			expect(inboxKey("***")).toBeNull();
		});

		it("streams the object of the inbox bucket with its audio type, passing Range on", async () => {
			const fetchMock = stubFetch(new Response("abc", { status: 206, headers: { "content-length": "3", "content-range": "bytes 0-2/10" } }));

			const ctx = createExecutionContext();
			const response = await worker.fetch(
				new Request(`https://wm.rn.ax/m/${id("folder/Song.m4a")}`, { headers: { range: "bytes=0-2" } }),
				{ ...env, GATEWAY_URL: "https://gw.example", GATEWAY_ACCESS_KEY: "k", GATEWAY_SECRET_KEY: "s" },
				ctx
			);
			await waitOnExecutionContext(ctx);

			const sent = fetchMock.mock.calls[0]![0] as Request;
			expect(sent.url).toBe("https://gw.example/inbox/folder/Song.m4a");
			expect(sent.headers.get("range")).toBe("bytes=0-2");
			expect(response.status).toBe(206);
			expect(response.headers.get("content-type")).toBe("audio/mp4");
			expect(response.headers.get("content-range")).toBe("bytes 0-2/10");
		});

		it("answers a clean 404 for an id that is not a path in the inbox", async () => {
			const ctx = createExecutionContext();
			const response = await worker.fetch(new Request(`https://wm.rn.ax/m/${id("../x")}`), env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
		});
	});
});
