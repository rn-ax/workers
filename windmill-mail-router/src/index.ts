import PostalMime from "postal-mime";

export interface Env {
	WINDMILL_BASE_URL: string;
	WINDMILL_TOKEN: string;
	CF_ACCESS_CLIENT_ID: string;
	CF_ACCESS_CLIENT_SECRET: string;
}

// Address convention: <kind>+<workspace>+<path-with-dots>@<domain>
//   kind:      "flow" or "script"
//   workspace: Windmill workspace id
//   path:      Windmill script/flow path, with "/" replaced by "."
//
// Example: flow+main+reminders.invoice_email@windmill.rutinerad.com
//   -> POST {WINDMILL_BASE_URL}/api/w/main/jobs/run/f/reminders/invoice_email
function parseTarget(toAddress: string): { kind: "f" | "p"; workspace: string; path: string } | null {
	const local = toAddress.split("@")[0] ?? "";
	const parts = local.split("+");
	if (parts.length < 3) return null;

	const [kindRaw, workspace, ...pathParts] = parts;
	const kind = kindRaw.toLowerCase();
	if (kind !== "flow" && kind !== "script") return null;
	if (!workspace) return null;

	const path = pathParts.join("+").split(".").filter(Boolean).join("/");
	if (!path) return null;

	return { kind: kind === "flow" ? "f" : "p", workspace, path };
}

export default {
	async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
		const target = parseTarget(message.to);
		if (!target) {
			message.setReject(
				`Unrecognized address format. Expected <flow|script>+<workspace>+<path-with-dots>@<domain>, got "${message.to}".`
			);
			return;
		}

		let parsed;
		try {
			parsed = await PostalMime.parse(message.raw);
		} catch (err) {
			message.setReject(`Failed to parse email: ${(err as Error).message}`);
			return;
		}

		const payload = {
			from: parsed.from?.address ?? message.from,
			from_name: parsed.from?.name ?? "",
			to: message.to,
			subject: parsed.subject ?? "",
			text: parsed.text ?? "",
			html: parsed.html ?? "",
			attachments: (parsed.attachments ?? []).map((a) => ({
				filename: a.filename ?? "",
				mimeType: a.mimeType ?? "",
				size: a.content instanceof ArrayBuffer ? a.content.byteLength : 0,
			})),
		};

		const runUrl = `${env.WINDMILL_BASE_URL}/api/w/${target.workspace}/jobs/run/${target.kind}/${target.path}`;

		let resp: Response;
		try {
			resp = await fetch(runUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${env.WINDMILL_TOKEN}`,
					"CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
					"CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
				},
				body: JSON.stringify(payload),
			});
		} catch (err) {
			message.setReject(`Could not reach Windmill: ${(err as Error).message}`);
			return;
		}

		if (!resp.ok) {
			const body = await resp.text().catch(() => "");
			message.setReject(`Windmill run failed (${resp.status}): ${body.slice(0, 200)}`);
			return;
		}

		console.log(`Triggered ${target.kind}/${target.workspace}/${target.path} from ${payload.from}`);
	},
};
