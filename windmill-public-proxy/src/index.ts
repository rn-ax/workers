export interface Env {
	CF_ACCESS_CLIENT_ID: string;
	CF_ACCESS_CLIENT_SECRET: string;
	WINDMILL_TOKEN: string;
	WINDMILL_WORKSPACE: string;
}

const WINDMILL_BASE_URL = "https://windmill.rn.ax";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace(/^\/+/, "");

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

		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				"content-type": upstream.headers.get("content-type") ?? "application/json",
			},
		});
	},
};
