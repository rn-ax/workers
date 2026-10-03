interface AppLink {
	name: string;
	host: string;
}

// Only apps confirmed to render plain HTML without a layout the injected bar
// is likely to clash with. Add more hosts here (and to wrangler.toml's
// routes) once each one's been checked.
const APPS: AppLink[] = [
	{ name: "Bookworm", host: "book.rn.ax" },
	{ name: "Butterfly", host: "butter.rn.ax" },
	{ name: "Copycat", host: "copy.rn.ax" },
	{ name: "Globetrotter", host: "globe.rn.ax" },
	{ name: "Grocy", host: "grocy.rn.ax" },
	{ name: "Gymrat", host: "gym.rn.ax" },
	{ name: "Nutcracker", host: "nut.rn.ax" },
	{ name: "Overseerr", host: "ovr.rn.ax" },
	{ name: "Portal", host: "rn.ax" },
	{ name: "Prompthawk", host: "prompt.rn.ax" },
	{ name: "Radarr", host: "radarr.rn.ax" },
	{ name: "Songbird", host: "song.rn.ax" },
	{ name: "Sonarr", host: "sonarr.rn.ax" },
	{ name: "Stringbean", host: "string.rn.ax" },
	{ name: "Tautulli", host: "tau.rn.ax" },
	{ name: "TrueNAS", host: "nas.rn.ax" },
	{ name: "Windmill", host: "windmill.rn.ax" },
	{ name: "Workhorse", host: "work.rn.ax" },
].sort((a, b) => a.name.localeCompare(b.name));

// Reserves space in the host page's body for the bar below. The bar's own
// height is now implicit (padding + content), not a fixed constant, so this
// is a deliberate overestimate rather than a measured value.
const BAR_OFFSET = "2.75rem";

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBar(currentHost: string): string {
	const links = APPS.map((app) => {
		const active = app.host === currentHost;
		const color = active ? "#f9fafb" : "#9ca3af";
		const weight = active ? "600" : "400";
		return `<a href="https://${app.host}/" style="color:${color};font-weight:${weight};text-decoration:none;white-space:nowrap;">${escapeHtml(app.name)}</a>`;
	}).join("");

	return `<div style="position:fixed;top:0;left:0;right:0;padding:0.5rem 1rem;background:#111827;font:12px system-ui,sans-serif;display:flex;justify-content:center;align-items:center;gap:16px;overflow-x:auto;white-space:nowrap;z-index:2147483647;box-sizing:border-box;">${links}</div>`;
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
					el.append(`<style>body{padding-top:${BAR_OFFSET} !important}</style>`, { html: true });
				},
			});

		return rewriter.transform(new Response(upstream.body, { ...upstream, headers }));
	},
};
