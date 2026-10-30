import { z } from "zod";
import {
	type GitHubDataRecord,
	type GitHubDataValue,
	githubDataRecordSchema,
	githubDataValueSchema,
} from "./data-values.ts";
import {
	type GitHubMergeResult,
	type GitHubProviderStatus,
	type GitHubPullRecord,
	githubActorSchema,
	githubMergeResultSchema,
	githubPullRecordSchema,
	githubPullRecordsSchema,
} from "./github-records.ts";
import type {
	BranchPullRequestState,
	GhRunner,
	GitHubRepository,
	IssueKey,
	IssueScope,
	IssueState,
	MergeAction,
	MergeMethod,
	PullFeedback,
	PullFeedbackEntry,
	PullFeedbackKind,
	PullKey,
	PullScope,
	PullStack,
	PullStackEntry,
	PullState,
	PullSubIssue,
	RepositoryVisibility,
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

// One GraphQL round trip for a pull request's status and its recent
// conversation comments, reviews, and open inline review threads. The author's
// `__typename` and `authorAssociation` let a caller tell bots and outside
// commenters apart from repository collaborators.
const FEEDBACK_ACTOR = "author { __typename login } authorAssociation";
const FEEDBACK_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number title url state isDraft mergedAt headRefName headRefOid updatedAt
      comments(last: 50) {
        totalCount
        nodes { id ${FEEDBACK_ACTOR} body createdAt isMinimized url viewerDidAuthor }
      }
      reviews(last: 50) {
        nodes { id ${FEEDBACK_ACTOR} body state submittedAt url viewerDidAuthor }
      }
      reviewThreads(last: 50) {
        nodes {
          isResolved isOutdated path line
          comments(last: 20) {
            nodes { id ${FEEDBACK_ACTOR} body createdAt isMinimized path line url viewerDidAuthor }
          }
        }
      }
    }
  }
}`;

const parseJson = <T>(output: string, contract: z.ZodType<T>): T =>
	contract.parse(JSON.parse(output));

const API_HEADERS = [
	"--header",
	"Accept: application/vnd.github+json",
	"--header",
	"X-GitHub-Api-Version: 2026-03-10",
];

const asRecord = (value: GitHubDataValue): GitHubDataRecord | null => {
	const record = githubDataRecordSchema.safeParse(value);
	return record.success ? record.data : null;
};

const textValue = (value: GitHubDataValue): string | undefined => {
	const text = z.string().min(1).safeParse(value);
	return text.success ? text.data : undefined;
};

const integerValue = (value: GitHubDataValue): number | undefined => {
	const number = z.number().safeParse(value);
	return number.success && Number.isSafeInteger(number.data) && number.data > 0
		? number.data
		: undefined;
};

const normalizeActor = (value: GitHubDataValue): PullStackEntry["author"] => {
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

const normalizeStack = (value: GitHubDataValue): PullStack | null => {
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

const normalizeSubIssues = (value: GitHubDataValue): PullSubIssue[] => {
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

const connectionNodes = (value: GitHubDataValue): GitHubDataValue[] => {
	const nodes = asRecord(value)?.nodes;
	return Array.isArray(nodes) ? nodes : [];
};

const normalizeFeedbackEntry = (
	value: GitHubDataValue,
	kind: PullFeedbackKind,
	thread?: GitHubDataRecord
): PullFeedbackEntry[] => {
	const node = asRecord(value);
	const id = textValue(node?.id);
	if (!(node && id)) {
		return [];
	}
	const author = asRecord(node.author);
	return [
		{
			author: textValue(author?.login) ?? null,
			authorAssociation: textValue(node.authorAssociation) ?? null,
			authorType: textValue(author?.__typename) ?? null,
			body: typeof node.body === "string" ? node.body : "",
			createdAt:
				textValue(node.createdAt) ?? textValue(node.submittedAt) ?? null,
			id,
			isMinimized: node.isMinimized === true,
			kind,
			line: integerValue(node.line) ?? integerValue(thread?.line) ?? null,
			path: textValue(node.path) ?? textValue(thread?.path) ?? null,
			state: textValue(node.state) ?? null,
			url: textValue(node.url) ?? null,
			viewerDidAuthor: node.viewerDidAuthor === true,
		},
	];
};

/** Flatten the feedback query into the pull request's status fields plus one
 * feedback list. Resolved and outdated inline threads are not actionable and
 * are left out. */
function normalizeFeedback(value: GitHubDataValue, key: PullKey): PullFeedback {
	const repository = asRecord(asRecord(asRecord(value)?.data)?.repository);
	const pull = asRecord(repository?.pullRequest);
	const number = integerValue(pull?.number);
	const title = textValue(pull?.title);
	const url = textValue(pull?.url);
	if (!(pull && number && title && url)) {
		throw new Error("GitHub did not return the pull request");
	}
	const comments = connectionNodes(pull.comments);
	const totalComments = asRecord(pull.comments)?.totalCount;
	const threadComments = connectionNodes(pull.reviewThreads).flatMap((item) => {
		const thread = asRecord(item);
		if (!thread || thread.isResolved === true || thread.isOutdated === true) {
			return [];
		}
		return connectionNodes(thread.comments).flatMap((comment) =>
			normalizeFeedbackEntry(comment, "review_comment", thread)
		);
	});
	return {
		commentsCount:
			typeof totalComments === "number" && Number.isSafeInteger(totalComments)
				? totalComments
				: comments.length,
		feedback: [
			...comments.flatMap((comment) =>
				normalizeFeedbackEntry(comment, "comment")
			),
			...connectionNodes(pull.reviews).flatMap((review) =>
				normalizeFeedbackEntry(review, "review")
			),
			...threadComments,
		],
		headRefName: textValue(pull.headRefName) ?? null,
		headRefOid: textValue(pull.headRefOid) ?? null,
		isDraft: pull.isDraft === true,
		mergedAt: textValue(pull.mergedAt) ?? null,
		number,
		repository: { nameWithOwner: key.repo },
		state: textValue(pull.state) ?? null,
		title,
		updatedAt: textValue(pull.updatedAt) ?? null,
		url,
	};
}

function normalizeRepository(value: GitHubDataValue): GitHubRepository {
	const record = asRecord(value);
	const nameWithOwner = textValue(record?.nameWithOwner);
	const url = textValue(record?.url);
	const defaultBranch = textValue(asRecord(record?.defaultBranchRef)?.name);
	if (!(nameWithOwner && url)) {
		throw new Error("GitHub did not return the current repository");
	}
	return { defaultBranch: defaultBranch ?? null, nameWithOwner, url };
}

export class GitHubProvider {
	constructor(private readonly gh: GhRunner) {}

	private async api(
		endpoint: string,
		args: string[] = []
	): Promise<GitHubDataValue> {
		const output = await this.gh.run([
			"api",
			endpoint,
			...API_HEADERS,
			...args,
		]);
		return output.trim() ? parseJson(output, githubDataValueSchema) : undefined;
	}

	async status(): Promise<GitHubProviderStatus> {
		const version = await this.gh.run(["--version"]);
		const viewer = githubActorSchema.parse(
			parseJson(
				await this.gh.run([
					"api",
					"user",
					"--jq",
					"{login:.login,avatarUrl:.avatar_url,name:.name}",
				]),
				githubDataValueSchema
			)
		);
		return {
			available: true,
			provider: "github",
			version: version.split("\n")[0] ?? "",
			viewer,
		};
	}

	async currentRepository(cwd: string): Promise<GitHubRepository> {
		const output = await this.gh.run(
			["repo", "view", "--json", "nameWithOwner,url,defaultBranchRef"],
			{ cwd }
		);
		return normalizeRepository(parseJson(output, githubDataValueSchema));
	}

	async createRepository(input: {
		cwd: string;
		name: string;
		visibility: RepositoryVisibility;
	}): Promise<GitHubRepository> {
		await this.gh.run(
			[
				"repo",
				"create",
				input.name,
				"--source",
				".",
				"--remote",
				"origin",
				input.visibility === "public" ? "--public" : "--private",
				"--push",
			],
			{ cwd: input.cwd }
		);
		return this.currentRepository(input.cwd);
	}

	async list(input: {
		limit: number;
		query: string;
		scope: PullScope;
		state: PullState;
	}): Promise<GitHubPullRecord[]> {
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
		return parseJson(await this.gh.run(args), githubPullRecordsSchema);
	}

	async listIssues(input: {
		limit: number;
		query: string;
		scope: IssueScope;
		state: IssueState;
	}): Promise<GitHubPullRecord[]> {
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
		return parseJson(await this.gh.run(args), githubPullRecordsSchema);
	}

	async detail(key: PullKey) {
		const detail = parseJson(
			await this.gh.run([
				"pr",
				"view",
				String(key.number),
				"--repo",
				key.repo,
				"--json",
				DETAIL_FIELDS,
			]),
			githubPullRecordSchema
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

	/** Status plus recent feedback in one GraphQL call. Lighter than `detail`,
	 * which also reads files, commits, checks, stacks, and sub-issues. Owner
	 * and name go through `-f` (raw strings, never `@file` reads). */
	async feedback(key: PullKey): Promise<PullFeedback> {
		const [owner = "", name = ""] = key.repo.split("/");
		const output = await this.gh.run([
			"api",
			"graphql",
			"-f",
			`query=${FEEDBACK_QUERY}`,
			"-f",
			`owner=${owner}`,
			"-f",
			`name=${name}`,
			"-F",
			`number=${key.number}`,
		]);
		return normalizeFeedback(parseJson(output, githubDataValueSchema), key);
	}

	async issueDetail(key: IssueKey) {
		const detail = parseJson(
			await this.gh.run([
				"issue",
				"view",
				String(key.number),
				"--repo",
				key.repo,
				"--json",
				ISSUE_DETAIL_FIELDS,
			]),
			githubPullRecordSchema
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
		const stacks = await this.api(
			`repos/${key.repo}/stacks?pull_request=${key.number}`
		);
		const summary = Array.isArray(stacks) ? stacks[0] : null;
		const stackNumber = integerValue(asRecord(summary)?.number);
		if (!stackNumber) {
			return null;
		}
		const stack = await this.api(`repos/${key.repo}/stacks/${stackNumber}`);
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
			const value = await this.api(
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
		const stack = await this.api(`repos/${repo}/stacks`, [
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
		const stack = await this.api(`repos/${repo}/stacks/${stackNumber}/add`, [
			"--method",
			"POST",
			...pullRequests.flatMap((number) => [
				"--field",
				`pull_requests[]=${number}`,
			]),
		]);
		return normalizeStack(stack);
	}

	async unstack(repo: string, stackNumber: number): Promise<PullStack | null> {
		const stack = await this.api(
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
	}): Promise<{ pull: GitHubPullRecord | null }> {
		const state = input.state ?? "open";
		const pulls = parseJson(
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
			),
			githubPullRecordsSchema
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
	): Promise<GitHubMergeResult> {
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
	): Promise<GitHubMergeResult> {
		return githubMergeResultSchema.parse(
			await this.api(`repos/${key.repo}/pulls/${key.number}/merge-async`, [
				"--method",
				"PUT",
				"--field",
				`merge_method=${strategy}`,
				"--field",
				`merge_action=${mergeAction}`,
			])
		);
	}

	async mergeStatus(
		key: PullKey,
		requestId: string
	): Promise<GitHubMergeResult> {
		return githubMergeResultSchema.parse(
			await this.api(
				`repos/${key.repo}/pulls/${key.number}/merge-async/${requestId}`
			)
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
