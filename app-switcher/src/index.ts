interface AppLink {
	name: string;
	host: string;
}

// Only apps confirmed to render plain HTML without a layout the injected bar
// is likely to clash with. Add more hosts here once each one's been checked;
// wrangler.toml's wildcard routes already cover them.
const APPS: AppLink[] = [
	{ name: "Beszel", host: "bzl.rn.ax" },
	{ name: "Bookworm", host: "book.rn.ax" },
	{ name: "Butterfly", host: "butter.rn.ax" },
	{ name: "Copycat", host: "copy.rn.ax" },
	{ name: "Globetrotter", host: "globe.rn.ax" },
	{ name: "Grocy", host: "grocy.rn.ax" },
	{ name: "Gymrat", host: "gym.rn.ax" },
	{ name: "Nutcracker", host: "nut.rn.ax" },
	{ name: "Paperless", host: "paper.rn.ax" },
	{ name: "Portal", host: "rn.ax" },
	{ name: "Prompthawk", host: "prompt.rn.ax" },
	{ name: "Radarr", host: "radarr.rn.ax" },
	{ name: "Seerr", host: "ovr.rn.ax" },
	{ name: "Sonarr", host: "sonarr.rn.ax" },
	{ name: "Songbird", host: "song.rn.ax" },
	{ name: "Stringbean", host: "string.rn.ax" },
	{ name: "Tautulli", host: "tau.rn.ax" },
	{ name: "TrueNAS", host: "nas.rn.ax" },
	{ name: "Windmill", host: "windmill.rn.ax" },
	{ name: "Workhorse", host: "work.rn.ax" },
].sort((a, b) => a.name.localeCompare(b.name));

const APP_HOSTS = new Set(APPS.map((app) => app.host));

interface Env {
	// Email of the one Access user who sees the bar. A Worker secret, so the
	// address stays out of this public repo; without it nobody sees the bar.
	SWITCHER_EMAIL?: string;
}

const BAR_ID = "rn-app-switcher";

// Fallback used until the script below has measured the bar.
const BAR_OFFSET = "2.75rem";

// Keeps page content below the bar. The bar's height is implicit (padding +
// content), so it is measured and published as --rn-bar-h. Elements that the
// app pins to the top of the viewport (position fixed/sticky near top:0) are
// not displaced by body padding, so they get their top offset pushed down by
// the bar's height; the original value is remembered in data-rn-top so a
// resize re-derives it.
const OFFSET_SCRIPT = `(function(){
var bar=document.getElementById("${BAR_ID}");
if(!bar)return;
var root=document.documentElement,queued=false;
function shift(h){
var els=document.body.getElementsByTagName("*");
for(var i=0;i<els.length;i++){
var el=els[i];
if(el===bar||bar.contains(el))continue;
var base=el.getAttribute("data-rn-top");
var top;
if(base===null){
var cs=getComputedStyle(el);
if(cs.position!=="fixed"&&cs.position!=="sticky")continue;
top=parseFloat(cs.top);
if(isNaN(top)||top>=h)continue;
el.setAttribute("data-rn-top",String(top));
base=top;
}
el.style.setProperty("top",(parseFloat(base)+h)+"px","important");
}
}
function update(){
queued=false;
var h=bar.getBoundingClientRect().height;
root.style.setProperty("--rn-bar-h",h+"px");
shift(h);
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(update);}}
update();
window.addEventListener("resize",schedule);
window.addEventListener("load",schedule);
new MutationObserver(function(m){
for(var i=0;i<m.length;i++){if(!bar.contains(m[i].target)){schedule();return;}}
}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden"]});
})();`;

// The worker runs after Access, so each request carries the authenticated
// user's email. The JWT fallback is decoded without verifying its signature:
// Access has already authenticated the request, and the result only decides
// who sees a navigation bar.
function accessEmail(request: Request): string | null {
	const header = request.headers.get("Cf-Access-Authenticated-User-Email");
	if (header) return header;

	const payload = request.headers.get("Cf-Access-Jwt-Assertion")?.split(".")[1];
	if (!payload) return null;
	try {
		const email = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).email;
		return typeof email === "string" ? email : null;
	} catch {
		return null;
	}
}

function isSwitcherUser(request: Request, env: Env): boolean {
	const allowed = env.SWITCHER_EMAIL?.trim().toLowerCase();
	const actual = accessEmail(request)?.trim().toLowerCase();
	return Boolean(allowed) && actual === allowed;
}

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

	return `<div style="position:fixed;top:0;left:0;right:0;padding:0.5rem 1rem;background:#111827;font:12px system-ui,sans-serif;display:flex;justify-content:center;align-items:center;gap:16px;overflow-x:auto;scrollbar-width:none;white-space:nowrap;z-index:2147483647;box-sizing:border-box;" id="${BAR_ID}">${links}</div><script>${OFFSET_SCRIPT}</script>`;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// The routes cover every rn.ax hostname; only hosts listed in APPS get
		// the bar, and only for the configured user.
		if (!APP_HOSTS.has(new URL(request.url).hostname) || !isSwitcherUser(request, env)) {
			return fetch(request);
		}

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
					el.append(`<style>body{padding-top:var(--rn-bar-h,${BAR_OFFSET}) !important}#${BAR_ID}::-webkit-scrollbar{display:none}</style>`, { html: true });
				},
			});

		return rewriter.transform(new Response(upstream.body, { ...upstream, headers }));
	},
};
