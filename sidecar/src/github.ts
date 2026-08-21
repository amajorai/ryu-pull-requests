import type {
	BranchPullRequestState,
	GhRunner,
	IssueKey,
	IssueScope,
	IssueState,
	MergeAction,
	MergeMethod,
	PullKey,
	PullScope,
	PullStack,
	PullStackEntry,
	PullState,
	PullSubIssue,
} from "./types.ts";

const LIST_FIELDS = [
	"author",
	"commentsCount",
	"createdAt",
	"mergedAt",
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
	"closingIssuesReferences",
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

const BRANCH_FIELDS = [
	"baseRefName",
	"commentsCount",
	"headRefName",
	"headRefOid",
	"isDraft",
	"mergeStateStatus",
	"mergeable",
	"mergedAt",
	"number",
	"repository",
	"state",
	"statusCheckRollup",
	"title",
	"updatedAt",
	"url",
].join(",");

const ISSUE_LIST_FIELDS = [
	"author",
	"closedAt",
	"commentsCount",
	"createdAt",
	"labels",
	"number",
	"repository",
	"state",
	"title",
	"updatedAt",
	"url",
].join(",");

const ISSUE_DETAIL_FIELDS = [
	"assignees",
	"author",
	"body",
	"closedAt",
	"comments",
	"createdAt",
	"labels",
	"number",
	"state",
	"title",
	"updatedAt",
	"url",
].join(",");

const parseJson = <T>(output: string): T => JSON.parse(output) as T;

const API_HEADERS = [
	"--header",
	"Accept: application/vnd.github+json",
	"--header",
	"X-GitHub-Api-Version: 2026-03-10",
];

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const textValue = (value: unknown): string | undefined =>
	typeof value === "string" && value.length > 0 ? value : undefined;

const integerValue = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? value
		: undefined;

const normalizeActor = (value: unknown): PullStackEntry["author"] => {
	const actor = asRecord(value);
	if (!actor) {
		return undefined;
	}
	return {
		avatarUrl: textValue(actor.avatar_url),
		login: textValue(actor.login),
		name: textValue(actor.name),
	};
};

const normalizeStack = (value: unknown): PullStack | null => {
	const raw = asRecord(value);
	const number = integerValue(raw?.number);
	if (!(raw && number)) {
		return null;
	}
	const baseRefName = textValue(asRecord(raw.base)?.ref) ?? "";
	const rawPullRequests = Array.isArray(raw.pull_requests)
		? raw.pull_requests
		: [];
	let previousHead = baseRefName;
	const pullRequests = rawPullRequests.flatMap((item): PullStackEntry[] => {
		const pull = asRecord(item);
		const pullNumber = integerValue(pull?.number);
		if (!(pull && pullNumber)) {
			return [];
		}
		const base = textValue(asRecord(pull.base)?.ref) ?? previousHead;
		const head = textValue(asRecord(pull.head)?.ref);
		if (head) {
			previousHead = head;
		}
		return [
			{
				author: normalizeActor(pull.user),
				baseRefName: base,
				headRefName: head,
				headRefOid: textValue(asRecord(pull.head)?.sha),
				isDraft: pull.draft === true,
				mergedAt: textValue(pull.merged_at) ?? null,
				number: pullNumber,
				state: textValue(pull.state) ?? "unknown",
				title: textValue(pull.title),
				url: textValue(pull.html_url) ?? textValue(pull.url),
			},
		];
	});
	return {
		baseRefName,
		createdAt: textValue(raw.created_at),
		number,
		open: raw.open === true,
		pullRequests,
		url: textValue(raw.url),
	};
};

const normalizeSubIssues = (value: unknown): PullSubIssue[] => {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((item): PullSubIssue[] => {
		const issue = asRecord(item);
		const number = integerValue(issue?.number);
		const title = textValue(issue?.title);
		if (!(issue && number && title)) {
			return [];
		}
		const repository = asRecord(issue.repository);
		const nameWithOwner =
			textValue(repository?.full_name) ?? textValue(repository?.nameWithOwner);
		return [
			{
				number,
				repository: nameWithOwner ? { nameWithOwner } : undefined,
				state: textValue(issue.state) ?? "unknown",
				title,
				url: textValue(issue.html_url) ?? textValue(issue.url),
			},
		];
	});
};

export class GitHubProvider {
	constructor(private readonly gh: GhRunner) {}

	private async api<T>(endpoint: string, args: string[] = []): Promise<T> {
		const output = await this.gh.run([
			"api",
			endpoint,
			...API_HEADERS,
			...args,
		]);
		return (output.trim() ? parseJson<T>(output) : undefined) as T;
	}

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

	async listIssues(input: {
		limit: number;
		query: string;
		scope: IssueScope;
		state: IssueState;
	}): Promise<unknown[]> {
		const args = ["search", "issues"];
		if (input.scope === "assigned") {
			args.push("--assignee", "@me");
		} else if (input.scope === "authored") {
			args.push("--author", "@me");
		} else {
			args.push("--involves", "@me");
		}
		args.push(
			"--state",
			input.state,
			"--sort",
			"updated",
			"--order",
			"desc",
			"--limit",
			String(input.limit),
			"--json",
			ISSUE_LIST_FIELDS
		);
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
		const stack = await this.stackIfAvailable(key);
		const subIssues = await this.subIssuesIfAvailable(key);
		return {
			...detail,
			assignees: Array.isArray(detail.assignees) ? detail.assignees : [],
			commentsCount: comments.length,
			comments,
			closingIssuesReferences: Array.isArray(detail.closingIssuesReferences)
				? detail.closingIssuesReferences
				: [],
			files: Array.isArray(detail.files) ? detail.files : [],
			latestReviews: Array.isArray(detail.latestReviews)
				? detail.latestReviews
				: [],
			repository: { nameWithOwner: key.repo },
			reviewRequests: Array.isArray(detail.reviewRequests)
				? detail.reviewRequests
				: [],
			stack,
			statusCheckRollup: Array.isArray(detail.statusCheckRollup)
				? detail.statusCheckRollup
				: [],
			subIssues,
		};
	}

	async issueDetail(key: IssueKey): Promise<unknown> {
		const detail = parseJson<Record<string, unknown>>(
			await this.gh.run([
				"issue",
				"view",
				String(key.number),
				"--repo",
				key.repo,
				"--json",
				ISSUE_DETAIL_FIELDS,
			])
		);
		const comments = Array.isArray(detail.comments) ? detail.comments : [];
		return {
			...detail,
			assignees: Array.isArray(detail.assignees) ? detail.assignees : [],
			comments,
			commentsCount: comments.length,
			labels: Array.isArray(detail.labels) ? detail.labels : [],
			repository: { nameWithOwner: key.repo },
		};
	}

	async issueComment(key: IssueKey, body: string): Promise<void> {
		await this.gh.run([
			"issue",
			"comment",
			String(key.number),
			"--repo",
			key.repo,
			"--body",
			body,
		]);
	}

	async issueState(key: IssueKey, state: IssueState): Promise<void> {
		await this.gh.run([
			"issue",
			state === "open" ? "reopen" : "close",
			String(key.number),
			"--repo",
			key.repo,
		]);
	}

	async stack(key: PullKey): Promise<PullStack | null> {
		const stacks = await this.api<unknown[]>(
			`repos/${key.repo}/stacks?pull_request=${key.number}`
		);
		const summary = Array.isArray(stacks) ? stacks[0] : null;
		const stackNumber = integerValue(asRecord(summary)?.number);
		if (!stackNumber) {
			return null;
		}
		const stack = await this.api<unknown>(
			`repos/${key.repo}/stacks/${stackNumber}`
		);
		return normalizeStack(stack);
	}

	private async stackIfAvailable(key: PullKey): Promise<PullStack | null> {
		try {
			return await this.stack(key);
		} catch {
			// Older GitHub Enterprise installations may not expose the preview API.
			// Keep the regular PR surface usable when stack metadata is unavailable.
			return null;
		}
	}

	private async subIssuesIfAvailable(key: PullKey): Promise<PullSubIssue[]> {
		try {
			const value = await this.api<unknown>(
				`repos/${key.repo}/issues/${key.number}/sub_issues?per_page=100`
			);
			return normalizeSubIssues(value);
		} catch {
			// Sub-issues are not available on every GitHub Enterprise installation.
			return [];
		}
	}

	async createStack(
		repo: string,
		pullRequests: number[]
	): Promise<PullStack | null> {
		const stack = await this.api<unknown>(`repos/${repo}/stacks`, [
			"--method",
			"POST",
			...pullRequests.flatMap((number) => [
				"--field",
				`pull_requests[]=${number}`,
			]),
		]);
		return normalizeStack(stack);
	}

	async addToStack(
		repo: string,
		stackNumber: number,
		pullRequests: number[]
	): Promise<PullStack | null> {
		const stack = await this.api<unknown>(
			`repos/${repo}/stacks/${stackNumber}/add`,
			[
				"--method",
				"POST",
				...pullRequests.flatMap((number) => [
					"--field",
					`pull_requests[]=${number}`,
				]),
			]
		);
		return normalizeStack(stack);
	}

	async unstack(repo: string, stackNumber: number): Promise<PullStack | null> {
		const stack = await this.api<unknown>(
			`repos/${repo}/stacks/${stackNumber}/unstack`,
			["--method", "POST"]
		);
		return normalizeStack(stack);
	}

	/** Resolve the single open PR for a checked-out local branch. The cwd is
	 * passed to gh rather than translated into a repository in Core, keeping
	 * GitHub repository discovery inside this app's provider boundary. */
	async byBranch(input: {
		branch: string;
		cwd: string;
		state?: BranchPullRequestState;
	}): Promise<unknown> {
		const state = input.state ?? "open";
		const pulls = parseJson<unknown[]>(
			await this.gh.run(
				[
					"pr",
					"list",
					"--head",
					input.branch,
					"--sort",
					"updated",
					"--order",
					"desc",
					"--state",
					state,
					"--limit",
					state === "all" ? "20" : "2",
					"--json",
					BRANCH_FIELDS,
				],
				{ cwd: input.cwd }
			)
		);
		if (state === "open" && pulls.length > 1) {
			throw new Error(
				`more than one open pull request exists for branch ${input.branch}`
			);
		}
		if (state === "all") {
			const openPull = pulls.find((pull) => {
				const record = asRecord(pull);
				const pullState = textValue(record?.state)?.toLowerCase();
				return pullState === "open";
			});
			return { pull: openPull ?? pulls[0] ?? null };
		}
		return { pull: pulls[0] ?? null };
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
		strategy: MergeMethod,
		auto: boolean,
		mergeAction: MergeAction = "default"
	): Promise<unknown> {
		if (await this.stackIfAvailable(key)) {
			return this.mergeStack(key, strategy, auto ? "merge_queue" : mergeAction);
		}
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
		return undefined;
	}

	async mergeStack(
		key: PullKey,
		strategy: MergeMethod,
		mergeAction: MergeAction
	): Promise<unknown> {
		return this.api<unknown>(
			`repos/${key.repo}/pulls/${key.number}/merge-async`,
			[
				"--method",
				"PUT",
				"--field",
				`merge_method=${strategy}`,
				"--field",
				`merge_action=${mergeAction}`,
			]
		);
	}

	async mergeStatus(key: PullKey, requestId: string): Promise<unknown> {
		return this.api<unknown>(
			`repos/${key.repo}/pulls/${key.number}/merge-async/${requestId}`
		);
	}

	async ready(key: PullKey, draft: boolean): Promise<void> {
		const args = ["pr", "ready", String(key.number), "--repo", key.repo];
		if (draft) {
			args.push("--undo");
		}
		await this.gh.run(args);
	}
}
