export interface Env {
	CF_ACCESS_CLIENT_ID: string;
	CF_ACCESS_CLIENT_SECRET: string;
	WINDMILL_TOKEN: string;
	WINDMILL_WORKSPACE: string;
	// JSON map of URL slug -> Windmill app share secret (from `GET
	// /api/w/<workspace>/apps/secret_of/<path>`), e.g. {"cost-claims": "..."}.
	// Lets apps/<slug> below redirect to the real /public/<workspace>/<secret>
	// URL without that secret ever appearing in a link anyone types or shares.
	APP_SECRETS_JSON: string;
}

const WINDMILL_BASE_URL = "https://windmill.rn.ax";

function notFound(): Response {
	return new Response(JSON.stringify({ error: "not found" }), {
		status: 404,
		headers: { "content-type": "application/json" },
	});
}

// apps/<slug> -> 302 to windmill.rn.ax/public/<workspace>/<secret>. Only a
// redirect, not a full reverse proxy: the app's own JS bundle makes further
// requests using URLs the server bakes in as pointing at windmill.rn.ax
// directly, so proxying the page itself would leave those follow-up calls
// leaking straight back to the gated origin.
function appRedirect(env: Env, slug: string): Response | null {
	let secrets: Record<string, string>;
	try {
		secrets = JSON.parse(env.APP_SECRETS_JSON);
	} catch {
		return null;
	}
	const secret = secrets[slug];
	if (!secret) {
		return null;
	}
	return Response.redirect(`${WINDMILL_BASE_URL}/public/${env.WINDMILL_WORKSPACE}/${secret}`, 302);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace(/^\/+/, "");

		if (!path) {
			return notFound();
		}

		if (path.startsWith("apps/")) {
			return appRedirect(env, path.slice("apps/".length)) ?? notFound();
		}

		// Every script exposed here is deliberately folder-owned (never a
		// bare user-owned u/... script) and, so far, always a script rather
		// than a flow — so the public path is just <folder>/<name>, and we
		// fill in Windmill's p/f/ (script, folder-owned) prefix ourselves.
		const target = new URL(
			`${WINDMILL_BASE_URL}/api/w/${env.WINDMILL_WORKSPACE}/jobs/run_wait_result/p/f/${path}`
		);
		target.search = url.search;

		const upstream = await fetch(target.toString(), {
			method: request.method,
			headers: {
				"CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
				"CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
				Authorization: `Bearer ${env.WINDMILL_TOKEN}`,
			},
			body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
		});

		// Windmill's own 404 body leaks internal implementation detail (e.g.
		// "script not found at name f/foo (lib.rs:2239)") — anything
		// unexpected gets a clean, generic 404 instead of that raw upstream
		// error text.
		if (upstream.status === 404) {
			return notFound();
		}

		// Feed scripts return plain JSON from Windmill, but JSON Feed's
		// registered media type is application/feed+json — some readers
		// (e.g. Feedbin) use the header to decide something is a feed at
		// all, before ever looking at the body.
		const contentType = path.startsWith("feeds/")
			? "application/feed+json"
			: upstream.headers.get("content-type") ?? "application/json";

		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				"content-type": contentType,
			},
		});
	},
};
