import { bearerOk, resolveSidecarToken } from "@ryu/sidecar-runtime";
import { GitHubDeviceAuth } from "./auth.ts";
import { GitHubProvider } from "./github.ts";
import type { GhRunner, GhRunOptions } from "./types.ts";
import {
	canonicalRepositoryCwd,
	parseBody,
	parseBranchLookup,
	parseBranchLookupState,
	parseIssueKey,
	parseIssueScope,
	parseIssueState,
	parseLimit,
	parseMergeRequestId,
	parsePullKey,
	parseRepositoryName,
	parseRepositoryVisibility,
	parseScope,
	parseStackNumber,
	parseStackPullRequests,
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
	async run(args: string[], options: GhRunOptions = {}): Promise<string> {
		const process = Bun.spawn(["gh", ...args], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			...(options.cwd ? { cwd: options.cwd } : {}),
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
	pathname: string,
	resource: "issues" | "pulls"
): { action?: string; number?: string; repo?: string } | null => {
	const prefix = `${MOUNT}/${resource}/`;
	if (!pathname.startsWith(prefix)) {
		return null;
	}
	const parts = pathname
		.slice(prefix.length)
		.split("/")
		.map(decodeURIComponent);
	if (parts.length < 3 || parts.length > 5) {
		return null;
	}
	return {
		action: parts.slice(3).join("/") || undefined,
		repo: `${parts[0]}/${parts[1]}`,
		number: parts[2],
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
	const token = options.token ?? resolveSidecarToken(Bun.env);
	return Bun.serve({
		hostname: "127.0.0.1",
		port:
			options.port ?? Number(Bun.env.RYU_PULL_REQUESTS_PORT ?? DEFAULT_PORT),
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/health") {
				return json({ ok: true, provider: "github" });
			}
			if (!bearerOk(request.headers.get("authorization") ?? undefined, token)) {
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
				if (
					request.method === "GET" &&
					url.pathname === `${MOUNT}/repository`
				) {
					return json({
						repository: await provider.currentRepository(
							await canonicalRepositoryCwd(url.searchParams.get("cwd"))
						),
					});
				}
				if (
					request.method === "POST" &&
					url.pathname === `${MOUNT}/repository/create`
				) {
					const body = await readJson(request);
					return json({
						repository: await provider.createRepository({
							cwd: await canonicalRepositoryCwd(body.cwd),
							name: parseRepositoryName(body.name),
							visibility: parseRepositoryVisibility(body.visibility),
						}),
					});
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
				if (request.method === "GET" && url.pathname === `${MOUNT}/issues`) {
					return json({
						issues: await provider.listIssues({
							limit: parseLimit(url.searchParams.get("limit")),
							query: (url.searchParams.get("q") ?? "").trim().slice(0, 256),
							scope: parseIssueScope(url.searchParams.get("scope")),
							state: parseIssueState(url.searchParams.get("state")),
						}),
					});
				}
				if (
					request.method === "GET" &&
					url.pathname === `${MOUNT}/pulls/branch`
				) {
					const input = parseBranchLookup(
						url.searchParams.get("cwd"),
						url.searchParams.get("branch")
					);
					input.cwd = await canonicalRepositoryCwd(input.cwd);
					return json(
						await provider.byBranch({
							...input,
							state: parseBranchLookupState(url.searchParams.get("state")),
						})
					);
				}
				const issueMatch = routeMatch(url.pathname, "issues");
				if (issueMatch) {
					const key = parseIssueKey(issueMatch.repo, issueMatch.number);
					if (request.method === "GET" && !issueMatch.action) {
						return json(await provider.issueDetail(key));
					}
					if (request.method !== "POST") {
						return json({ error: "method not allowed" }, 405);
					}
					const body = await readJson(request);
					if (issueMatch.action === "comment") {
						await provider.issueComment(key, parseBody(body.body));
					} else if (issueMatch.action === "state") {
						if (body.state !== "open" && body.state !== "closed") {
							throw new Error("invalid issue state");
						}
						await provider.issueState(key, body.state);
					} else {
						return json({ error: "not found" }, 404);
					}
					return json({ ok: true });
				}
				const match = routeMatch(url.pathname, "pulls");
				if (!match) {
					return json({ error: "not found" }, 404);
				}
				const key = parsePullKey(match.repo, match.number);
				if (request.method === "GET" && !match.action) {
					return json(await provider.detail(key));
				}
				if (request.method === "GET" && match.action === "stack") {
					return json({ stack: await provider.stack(key) });
				}
				if (request.method === "GET" && match.action === "diff") {
					return json(await provider.diff(key));
				}
				if (request.method === "GET" && match.action === "merge-async/status") {
					return json(
						await provider.mergeStatus(
							key,
							parseMergeRequestId(url.searchParams.get("id"))
						)
					);
				}
				if (request.method !== "POST") {
					return json({ error: "method not allowed" }, 405);
				}
				const body = await readJson(request);
				if (match.action === "stack") {
					const stack = await provider.createStack(
						key.repo,
						parseStackPullRequests(body.pullRequests)
					);
					return json({ ok: true, stack });
				}
				if (match.action === "stack/add") {
					const stack = await provider.addToStack(
						key.repo,
						parseStackNumber(body.stackNumber),
						parseStackPullRequests(body.pullRequests, 1)
					);
					return json({ ok: true, stack });
				}
				if (match.action === "stack/unstack") {
					const stack = await provider.unstack(
						key.repo,
						parseStackNumber(body.stackNumber)
					);
					return json({ ok: true, stack });
				}
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
					const mergeAction = body.mergeAction ?? "default";
					if (
						mergeAction !== "default" &&
						mergeAction !== "direct_merge" &&
						mergeAction !== "merge_queue"
					) {
						throw new Error("invalid merge action");
					}
					const result = await provider.merge(
						key,
						strategy,
						body.auto === true,
						mergeAction
					);
					return json({ ok: true, result });
				} else if (match.action === "merge-async") {
					const strategy = body.strategy;
					if (
						strategy !== "merge" &&
						strategy !== "rebase" &&
						strategy !== "squash"
					) {
						throw new Error("invalid merge strategy");
					}
					const mergeAction = body.mergeAction ?? "default";
					if (
						mergeAction !== "default" &&
						mergeAction !== "direct_merge" &&
						mergeAction !== "merge_queue"
					) {
						throw new Error("invalid merge action");
					}
					const result = await provider.mergeStack(key, strategy, mergeAction);
					return json({ ok: true, result });
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
