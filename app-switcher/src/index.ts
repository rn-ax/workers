interface AppLink {
	name: string;
	host: string;
}

// Only apps confirmed to render plain HTML without a layout the injected bar
// is likely to clash with. Add more hosts here (and to wrangler.toml's
// routes) once each one's been checked.
const APPS: AppLink[] = [
	{ name: "Baserow", host: "baserow.rn.ax" },
	{ name: "Gitea", host: "git.rn.ax" },
	{ name: "NocoDB", host: "noco.rn.ax" },
	{ name: "Radarr", host: "radarr.rn.ax" },
	{ name: "Saltcorn", host: "salt.rn.ax" },
	{ name: "Sonarr", host: "sonarr.rn.ax" },
	{ name: "TrueNAS", host: "nas.rn.ax" },
	{ name: "Windmill", host: "windmill.rn.ax" },
].sort((a, b) => a.name.localeCompare(b.name));

const BAR_HEIGHT = "28px";

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBar(currentHost: string): string {
	const links = APPS.map((app) => {
		const active = app.host === currentHost;
		const color = active ? "#f9fafb" : "#9ca3af";
		const weight = active ? "600" : "400";
		return `<a href="https://${app.host}/" style="color:${color};font-weight:${weight};text-decoration:none;margin-right:16px;white-space:nowrap;">${escapeHtml(app.name)}</a>`;
	}).join("");

	return `<div style="position:fixed;top:0;left:0;right:0;height:${BAR_HEIGHT};line-height:${BAR_HEIGHT};background:#111827;padding:0 12px;font:12px system-ui,sans-serif;overflow-x:auto;white-space:nowrap;z-index:2147483647;box-sizing:border-box;">${links}</div>`;
}

export default {
	async fetch(request: Request): Promise<Response> {
		const upstream = await fetch(request);

		const contentType = upstream.headers.get("content-type") ?? "";
		if (!contentType.includes("text/html")) {
			return upstream;
		}

		const headers = new Headers(upstream.headers);
		// The injected bar is inline-styled; app CSPs vary and some would
		// block it outright, so it's simplest to strip CSP for these
		// Access-gated, single-user pages rather than tailor a policy per app.
		headers.delete("content-security-policy");
		headers.delete("content-security-policy-report-only");

		const currentHost = new URL(request.url).hostname;
		const rewriter = new HTMLRewriter()
			.on("body", {
				element(el) {
					el.prepend(renderBar(currentHost), { html: true });
				},
			})
			.on("head", {
				element(el) {
					// padding (not margin) so it can't collapse into a child's
					// own margin, and !important to beat the app's own body rule.
					el.append(`<style>body{padding-top:${BAR_HEIGHT} !important}</style>`, { html: true });
				},
			});

		return rewriter.transform(new Response(upstream.body, { ...upstream, headers }));
	},
};
