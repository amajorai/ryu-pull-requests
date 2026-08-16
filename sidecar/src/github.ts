import type { GhRunner, PullKey, PullScope, PullState } from "./types.ts";

const LIST_FIELDS = [
	"author",
	"commentsCount",
	"createdAt",
	"isDraft",
	"labels",
	"number",
	"repository",
	"state",
	"title",
	"updatedAt",
	"url",
].join(",");

const DETAIL_FIELDS = [
	"additions",
	"assignees",
	"author",
	"baseRefName",
	"body",
	"changedFiles",
	"comments",
	"commits",
	"createdAt",
	"deletions",
	"files",
	"headRefName",
	"isDraft",
	"labels",
	"latestReviews",
	"mergeStateStatus",
	"mergeable",
	"mergedAt",
	"mergedBy",
	"number",
	"reviewDecision",
	"reviewRequests",
	"state",
	"statusCheckRollup",
	"title",
	"updatedAt",
	"url",
].join(",");

const parseJson = <T>(output: string): T => JSON.parse(output) as T;

export class GitHubProvider {
	constructor(private readonly gh: GhRunner) {}

	async status(): Promise<unknown> {
		const version = await this.gh.run(["--version"]);
		const viewer = parseJson<unknown>(
			await this.gh.run([
				"api",
				"user",
				"--jq",
				"{login:.login,avatarUrl:.avatar_url,name:.name}",
			])
		);
		return {
			available: true,
			provider: "github",
			version: version.split("\n")[0],
			viewer,
		};
	}

	async list(input: {
		limit: number;
		query: string;
		scope: PullScope;
		state: PullState;
	}): Promise<unknown[]> {
		const args = ["search", "prs"];
		if (input.scope === "authored") {
			args.push("--author", "@me");
		} else if (input.scope === "reviewing") {
			args.push("--review-requested", "@me");
		} else {
			args.push("--involves", "@me");
		}
		if (input.state === "merged") {
			args.push("--merged");
		} else {
			args.push("--state", input.state);
		}
		args.push(
			"--sort",
			"updated",
			"--order",
			"desc",
			"--limit",
			String(input.limit),
			"--json",
			LIST_FIELDS
		);
		// `--` makes the user-entered search text positional even when it starts
		// with a dash, so it cannot inject or replace CLI flags.
		if (input.query) {
			args.push("--", input.query);
		}
		return parseJson<unknown[]>(await this.gh.run(args));
	}

	async detail(key: PullKey): Promise<unknown> {
		const detail = parseJson<Record<string, unknown>>(
			await this.gh.run([
				"pr",
				"view",
				String(key.number),
				"--repo",
				key.repo,
				"--json",
				DETAIL_FIELDS,
			])
		);
		const comments = Array.isArray(detail.comments) ? detail.comments : [];
		return {
			...detail,
			assignees: Array.isArray(detail.assignees) ? detail.assignees : [],
			commentsCount: comments.length,
			comments,
			files: Array.isArray(detail.files) ? detail.files : [],
			latestReviews: Array.isArray(detail.latestReviews)
				? detail.latestReviews
				: [],
			repository: { nameWithOwner: key.repo },
			reviewRequests: Array.isArray(detail.reviewRequests)
				? detail.reviewRequests
				: [],
			statusCheckRollup: Array.isArray(detail.statusCheckRollup)
				? detail.statusCheckRollup
				: [],
		};
	}

	async diff(key: PullKey): Promise<{ patch: string; truncated: boolean }> {
		const patch = await this.gh.run([
			"pr",
			"diff",
			String(key.number),
			"--repo",
			key.repo,
			"--patch",
			"--color",
			"never",
		]);
		const maxChars = 600_000;
		return {
			patch: patch.slice(0, maxChars),
			truncated: patch.length > maxChars,
		};
	}

	async comment(key: PullKey, body: string): Promise<void> {
		await this.gh.run([
			"pr",
			"comment",
			String(key.number),
			"--repo",
			key.repo,
			"--body",
			body,
		]);
	}

	async review(
		key: PullKey,
		action: "approve" | "comment" | "request_changes",
		body: string
	): Promise<void> {
		const flag =
			action === "approve"
				? "--approve"
				: action === "comment"
					? "--comment"
					: "--request-changes";
		const args = ["pr", "review", String(key.number), "--repo", key.repo, flag];
		if (body) {
			args.push("--body", body);
		}
		await this.gh.run(args);
	}

	async merge(
		key: PullKey,
		strategy: "merge" | "rebase" | "squash",
		auto: boolean
	): Promise<void> {
		const args = [
			"pr",
			"merge",
			String(key.number),
			"--repo",
			key.repo,
			`--${strategy}`,
		];
		if (auto) {
			args.push("--auto");
		}
		await this.gh.run(args);
	}

	async ready(key: PullKey, draft: boolean): Promise<void> {
		const args = ["pr", "ready", String(key.number), "--repo", key.repo];
		if (draft) {
			args.push("--undo");
		}
		await this.gh.run(args);
	}
}
