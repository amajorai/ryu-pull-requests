import { GitHubDeviceAuth } from "./auth.ts";
import { GitHubProvider } from "./github.ts";
import type { GhRunner } from "./types.ts";
import {
	parseBody,
	parseLimit,
	parsePullKey,
	parseScope,
	parseState,
} from "./validation.ts";

const DEFAULT_PORT = 8016;
const MOUNT = "/api/pull-requests";
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

class CliError extends Error {
	constructor(
		message: string,
		readonly exitCode: number
	) {
		super(message);
	}
}

export class BunGhRunner implements GhRunner {
	async run(
		args: string[],
		options: { allowExitCodes?: number[] } = {}
	): Promise<string> {
		const process = Bun.spawn(["gh", ...args], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...Bun.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(process.stdout).text(),
			new Response(process.stderr).text(),
			process.exited,
		]);
		if (stdout.length > MAX_OUTPUT_BYTES || stderr.length > MAX_OUTPUT_BYTES) {
			throw new CliError("GitHub CLI response was too large", exitCode);
		}
		if (exitCode !== 0 && !options.allowExitCodes?.includes(exitCode)) {
			throw new CliError(
				stderr.trim() || `gh exited with status ${exitCode}`,
				exitCode
			);
		}
		return stdout;
	}
}

const json = (body: unknown, status = 200): Response =>
	Response.json(body, { status, headers: { "cache-control": "no-store" } });

const readJson = async (request: Request): Promise<Record<string, unknown>> => {
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("request body must be JSON");
	}
	const value: unknown = await request.json();
	if (!(value && typeof value === "object" && !Array.isArray(value))) {
		throw new Error("request body must be an object");
	}
	return value as Record<string, unknown>;
};

const routeMatch = (
	pathname: string
): { action?: string; number?: string; repo?: string } | null => {
	const prefix = `${MOUNT}/pulls/`;
	if (!pathname.startsWith(prefix)) {
		return null;
	}
	const parts = pathname
		.slice(prefix.length)
		.split("/")
		.map(decodeURIComponent);
	if (parts.length < 3 || parts.length > 4) {
		return null;
	}
	return {
		repo: `${parts[0]}/${parts[1]}`,
		number: parts[2],
		action: parts[3],
	};
};

export function createServer(
	options: {
		auth?: GitHubDeviceAuth;
		provider?: GitHubProvider;
		token?: string;
		port?: number;
	} = {}
): ReturnType<typeof Bun.serve> {
	const provider = options.provider ?? new GitHubProvider(new BunGhRunner());
	const auth = options.auth ?? new GitHubDeviceAuth();
	const token = options.token ?? Bun.env.RYU_EXT_TOKEN ?? "";
	return Bun.serve({
		hostname: "127.0.0.1",
		port:
			options.port ?? Number(Bun.env.RYU_PULL_REQUESTS_PORT ?? DEFAULT_PORT),
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/health") {
				return json({ ok: true, provider: "github" });
			}
			if (
				!token ||
				request.headers.get("authorization") !== `Bearer ${token}`
			) {
				return json({ error: "unauthorized" }, 401);
			}
			try {
				if (url.pathname === `${MOUNT}/auth/device`) {
					if (request.method === "GET") {
						return json({ auth: auth.current() });
					}
					if (request.method === "POST") {
						return json({ auth: await auth.start() });
					}
					if (request.method === "DELETE") {
						return json({ auth: auth.cancel() });
					}
					return json({ error: "method not allowed" }, 405);
				}
				if (request.method === "GET" && url.pathname === `${MOUNT}/status`) {
					return json(await provider.status());
				}
				if (request.method === "GET" && url.pathname === `${MOUNT}/pulls`) {
					return json({
						pulls: await provider.list({
							limit: parseLimit(url.searchParams.get("limit")),
							query: (url.searchParams.get("q") ?? "").trim().slice(0, 256),
							scope: parseScope(url.searchParams.get("scope")),
							state: parseState(url.searchParams.get("state")),
						}),
					});
				}
				const match = routeMatch(url.pathname);
				if (!match) {
					return json({ error: "not found" }, 404);
				}
				const key = parsePullKey(match.repo, match.number);
				if (request.method === "GET" && !match.action) {
					return json(await provider.detail(key));
				}
				if (request.method === "GET" && match.action === "diff") {
					return json(await provider.diff(key));
				}
				if (request.method !== "POST") {
					return json({ error: "method not allowed" }, 405);
				}
				const body = await readJson(request);
				if (match.action === "comment") {
					await provider.comment(key, parseBody(body.body));
				} else if (match.action === "review") {
					const action = body.action;
					if (
						action !== "approve" &&
						action !== "comment" &&
						action !== "request_changes"
					) {
						throw new Error("invalid review action");
					}
					await provider.review(
						key,
						action,
						parseBody(body.body ?? "", action === "request_changes")
					);
				} else if (match.action === "merge") {
					const strategy = body.strategy;
					if (
						strategy !== "merge" &&
						strategy !== "rebase" &&
						strategy !== "squash"
					) {
						throw new Error("invalid merge strategy");
					}
					await provider.merge(key, strategy, body.auto === true);
				} else if (match.action === "ready") {
					await provider.ready(key, body.draft === true);
				} else {
					return json({ error: "not found" }, 404);
				}
				return json({ ok: true });
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "request failed";
				const status =
					error instanceof CliError
						? error.exitCode === 127
							? 503
							: 502
						: 400;
				return json({ error: message }, status);
			}
		},
	});
}
