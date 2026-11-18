import { AwsClient } from "aws4fetch";

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
	// The S3 gateway (versitygw) behind a Tunnel hostname that Cloudflare Access
	// protects with the same service token as above, and the keys of a gateway
	// user that can read the `inbox` bucket. Serves m/<id> below.
	GATEWAY_URL: string;
	GATEWAY_ACCESS_KEY: string;
	GATEWAY_SECRET_KEY: string;
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

// m/<id> -> the inbox file whose path in the `inbox` bucket is the base64url form
// of <id>. The inbox is temporary, so the id is only opaque: no signature, no
// expiry. A Range request is passed on so the browser can seek.
const AUDIO_TYPES: Record<string, string> = { m4a: "audio/mp4", mp3: "audio/mpeg", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", webm: "audio/webm" };

export function inboxKey(id: string): string | null {
	try {
		const padded = id.replace(/-/g, "+").replace(/_/g, "/");
		const key = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
		const parts = key.split("/");
		return key && !key.startsWith("/") && !parts.some((p) => p === ".." || p === "." || p === "" || p.startsWith(".")) ? key : null;
	} catch {
		return null;
	}
}

async function inboxAudio(request: Request, env: Env, id: string): Promise<Response> {
	const key = inboxKey(id);
	if (!key) {
		return notFound();
	}
	const aws = new AwsClient({ accessKeyId: env.GATEWAY_ACCESS_KEY, secretAccessKey: env.GATEWAY_SECRET_KEY, service: "s3", region: "us-east-1" });
	// The request is signed bare and the Access headers and Range are added after: Cloudflare changes headers on the way
	// to the Tunnel, and a signed header that arrives changed fails the gateway's signature check.
	const url = `${env.GATEWAY_URL}/inbox/${key.split("/").map(encodeURIComponent).join("/")}`;
	const signed = await aws.sign(url, { method: "GET" });
	signed.headers.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
	signed.headers.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);
	const range = request.headers.get("range");
	if (range) {
		signed.headers.set("range", range);
	}
	const upstream = await fetch(signed);
	if (upstream.status === 404 || upstream.status === 403) {
		return notFound();
	}
	const out = new Headers({ "accept-ranges": "bytes", "content-type": AUDIO_TYPES[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream" });
	for (const name of ["content-length", "content-range"]) {
		const value = upstream.headers.get(name);
		if (value) {
			out.set(name, value);
		}
	}
	return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace(/^\/+/, "");

		if (!path) {
			return notFound();
		}

		if (path.startsWith("m/")) {
			return inboxAudio(request, env, path.slice("m/".length));
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
