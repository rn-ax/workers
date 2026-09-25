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

		const target = new URL(
			`${WINDMILL_BASE_URL}/api/w/${env.WINDMILL_WORKSPACE}/jobs/run_wait_result/${path}`
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
