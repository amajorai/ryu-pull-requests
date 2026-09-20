import { describe, expect, test } from "bun:test";
import { GitHubProvider } from "./github.ts";
import type { GhRunner } from "./types.ts";

class RecordingRunner implements GhRunner {
	readonly calls: string[][] = [];
	readonly options: Array<{ cwd?: string }> = [];

	constructor(private readonly replies: string[]) {}

	async run(args: string[], options?: { cwd?: string }): Promise<string> {
		this.calls.push(args);
		this.options.push({ cwd: options?.cwd });
		return this.replies.shift() ?? "{}";
	}
}

describe("GitHubProvider", () => {
	test("discovers the current repository and default branch", async () => {
		const runner = new RecordingRunner([
			JSON.stringify({
				defaultBranchRef: { name: "master" },
				nameWithOwner: "acme/app",
				url: "https://github.com/acme/app",
			}),
		]);
		const provider = new GitHubProvider(runner);

		await expect(provider.currentRepository("/repo")).resolves.toEqual({
			defaultBranch: "master",
			nameWithOwner: "acme/app",
			url: "https://github.com/acme/app",
		});
		expect(runner.calls[0]).toEqual([
			"repo",
			"view",
			"--json",
			"nameWithOwner,url,defaultBranchRef",
		]);
		expect(runner.options[0]).toEqual({ cwd: "/repo" });
	});

	test("creates a private repository from the local source and pushes it", async () => {
		const runner = new RecordingRunner([
			"https://github.com/acme/app\n",
			JSON.stringify({
				defaultBranchRef: { name: "main" },
				nameWithOwner: "acme/app",
				url: "https://github.com/acme/app",
			}),
		]);
		const provider = new GitHubProvider(runner);

		await provider.createRepository({
			cwd: "/repo",
			name: "acme/app",
			visibility: "private",
		});

		expect(runner.calls[0]).toEqual([
			"repo",
			"create",
			"acme/app",
			"--source",
			".",
			"--remote",
			"origin",
			"--private",
			"--push",
		]);
		expect(runner.options[0]).toEqual({ cwd: "/repo" });
	});

	test("passes search text after the CLI option terminator", async () => {
		const runner = new RecordingRunner(["[]"]);
		const provider = new GitHubProvider(runner);

		await provider.list({
			limit: 50,
			query: "--repo not/an-option",
			scope: "reviewing",
			state: "open",
		});

		expect(runner.calls[0]?.slice(-2)).toEqual(["--", "--repo not/an-option"]);
		expect(runner.calls[0]).toContain("--review-requested");
	});

	test("lists issues with the selected scope and state", async () => {
		const runner = new RecordingRunner(["[]"]);
		const provider = new GitHubProvider(runner);

		await provider.listIssues({
			limit: 50,
			query: "--repo not/an-option",
			scope: "assigned",
			state: "closed",
		});

		expect(runner.calls[0]).toEqual(
			expect.arrayContaining([
				"search",
				"issues",
				"--assignee",
				"@me",
				"--state",
				"closed",
				"--",
				"--repo not/an-option",
			])
		);
	});

	test("adds repository identity and normalizes nullable detail arrays", async () => {
		const runner = new RecordingRunner([
			JSON.stringify({ comments: null, files: null, number: 42 }),
			"[]",
			"[]",
		]);
		const provider = new GitHubProvider(runner);

		await expect(
			provider.detail({ number: 42, repo: "openai/codex" })
		).resolves.toMatchObject({
			comments: [],
			commentsCount: 0,
			files: [],
			repository: { nameWithOwner: "openai/codex" },
			statusCheckRollup: [],
			subIssues: [],
		});
	});

	test("reads GitHub sub-issues as PR subtasks", async () => {
		const runner = new RecordingRunner([
			JSON.stringify({ comments: [], number: 42 }),
			"[]",
			JSON.stringify([
				{
					html_url: "https://github.com/acme/app/issues/43",
					number: 43,
					repository: { full_name: "acme/app" },
					state: "closed",
					title: "Ship the data layer",
				},
			]),
		]);
		const provider = new GitHubProvider(runner);

		await expect(
			provider.detail({ number: 42, repo: "acme/app" })
		).resolves.toMatchObject({
			subIssues: [
				{
					number: 43,
					repository: { nameWithOwner: "acme/app" },
					state: "closed",
				},
			],
		});
		expect(runner.calls[2]).toContain(
			"repos/acme/app/issues/42/sub_issues?per_page=100"
		);
	});

	test("normalizes issue details and supports issue discussion actions", async () => {
		const runner = new RecordingRunner([
			JSON.stringify({
				assignees: [{ login: "octocat" }],
				body: "Track the release",
				comments: [{ author: { login: "hubot" }, body: "On it" }],
				labels: [{ name: "priority", color: "b60205" }],
				number: 7,
				state: "OPEN",
				title: "Ship the release",
			}),
			"",
			"",
		]);
		const provider = new GitHubProvider(runner);
		const key = { number: 7, repo: "acme/app" };

		await expect(provider.issueDetail(key)).resolves.toMatchObject({
			assignees: [{ login: "octocat" }],
			comments: [{ body: "On it" }],
			commentsCount: 1,
			labels: [{ name: "priority" }],
			repository: { nameWithOwner: "acme/app" },
		});
		await provider.issueComment(key, "A useful update");
		await provider.issueState(key, "closed");

		expect(runner.calls[1]).toEqual([
			"issue",
			"comment",
			"7",
			"--repo",
			"acme/app",
			"--body",
			"A useful update",
		]);
		expect(runner.calls[2]).toEqual([
			"issue",
			"close",
			"7",
			"--repo",
			"acme/app",
		]);
	});

	test("looks up one open pull request from the local branch cwd", async () => {
		const runner = new RecordingRunner([
			JSON.stringify([
				{
					baseRefName: "main",
					commentsCount: 3,
					headRefName: "codex/ci",
					mergeStateStatus: "DIRTY",
					mergeable: "CONFLICTING",
					number: 42,
					statusCheckRollup: [
						{ bucket: "fail", name: "Type-check", detailsUrl: "https://ci" },
					],
					title: "Fix CI",
					url: "https://github.com/openai/codex/pull/42",
				},
			]),
		]);
		const provider = new GitHubProvider(runner);

		await expect(
			provider.byBranch({ branch: "codex/ci", cwd: "/repo" })
		).resolves.toMatchObject({
			pull: {
				commentsCount: 3,
				mergeStateStatus: "DIRTY",
				mergeable: "CONFLICTING",
				number: 42,
				title: "Fix CI",
			},
		});
		expect(runner.options[0]).toEqual({ cwd: "/repo" });
		expect(runner.calls[0]).toContain("--head");
		expect(runner.calls[0]).toContain("codex/ci");
		expect(runner.calls[0]?.join(",")).toContain("mergeStateStatus");
		expect(runner.calls[0]?.join(",")).toContain("mergeable");
	});

	test("looks up the latest non-open pull request when requested", async () => {
		const runner = new RecordingRunner([
			JSON.stringify([
				{
					isDraft: false,
					mergedAt: "2026-08-19T10:00:00Z",
					number: 43,
					state: "MERGED",
					title: "Merge CI",
				},
			]),
		]);
		const provider = new GitHubProvider(runner);

		await expect(
			provider.byBranch({ branch: "codex/ci", cwd: "/repo", state: "all" })
		).resolves.toMatchObject({
			pull: {
				mergedAt: "2026-08-19T10:00:00Z",
				number: 43,
				state: "MERGED",
			},
		});
		expect(runner.calls[0]).toContain("--state");
		expect(runner.calls[0]).toContain("all");
		expect(runner.calls[0]).toContain("--limit");
		expect(runner.calls[0]).toContain("20");
		expect(runner.calls[0]?.join(" ")).toContain("mergedAt");
	});

	test("refuses ambiguous open pull requests for one branch", async () => {
		const runner = new RecordingRunner([JSON.stringify([{}, {}])]);
		const provider = new GitHubProvider(runner);

		await expect(
			provider.byBranch({ branch: "codex/ci", cwd: "/repo" })
		).rejects.toThrow("more than one open pull request");
	});

	test("reads and normalizes an ordered remote stack", async () => {
		const runner = new RecordingRunner([
			JSON.stringify([{ number: 97_525 }]),
			JSON.stringify({
				base: { ref: "canary" },
				created_at: "2026-08-18T22:15:51Z",
				number: 97_525,
				open: true,
				pull_requests: [
					{
						base: { ref: "canary" },
						draft: false,
						head: { ref: "feat/data", sha: "aaa" },
						html_url: "https://github.com/acme/app/pull/1",
						number: 1,
						state: "open",
						title: "Data layer",
						user: { login: "octocat" },
					},
					{
						base: { ref: "feat/data" },
						draft: true,
						head: { ref: "feat/ui", sha: "bbb" },
						html_url: "https://github.com/acme/app/pull/2",
						number: 2,
						state: "open",
						title: "UI layer",
						user: { login: "octocat" },
					},
				],
			}),
		]);
		const provider = new GitHubProvider(runner);

		await expect(
			provider.stack({ number: 2, repo: "acme/app" })
		).resolves.toMatchObject({
			baseRefName: "canary",
			number: 97_525,
			pullRequests: [
				{ baseRefName: "canary", headRefName: "feat/data", number: 1 },
				{
					baseRefName: "feat/data",
					headRefName: "feat/ui",
					isDraft: true,
					number: 2,
				},
			],
		});
		expect(runner.calls[0]).toContain("api");
		expect(runner.calls[0]).toContain("repos/acme/app/stacks?pull_request=2");
		expect(runner.calls[0]).toContain("X-GitHub-Api-Version: 2026-03-10");
	});

	test("creates a stack with bottom-to-top pull request numbers", async () => {
		const runner = new RecordingRunner([
			JSON.stringify({ number: 7, base: { ref: "main" }, pull_requests: [] }),
		]);
		const provider = new GitHubProvider(runner);

		await provider.createStack("acme/app", [10, 11, 12]);

		expect(runner.calls[0]).toEqual(
			expect.arrayContaining([
				"api",
				"repos/acme/app/stacks",
				"--method",
				"POST",
				"--field",
				"pull_requests[]=10",
				"pull_requests[]=11",
				"pull_requests[]=12",
			])
		);
	});

	test("uses GitHub's asynchronous merge API for stacked pull requests", async () => {
		const runner = new RecordingRunner([
			JSON.stringify([{ number: 7 }]),
			JSON.stringify({
				base: { ref: "main" },
				number: 7,
				open: true,
				pull_requests: [{ number: 42, head: { ref: "feat" }, state: "open" }],
			}),
			JSON.stringify({
				status: "pending",
				details: { uuid: "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42" },
			}),
		]);
		const provider = new GitHubProvider(runner);

		await provider.merge({ number: 42, repo: "acme/app" }, "squash", false);

		expect(runner.calls[2]).toEqual(
			expect.arrayContaining([
				"api",
				"repos/acme/app/pulls/42/merge-async",
				"--method",
				"PUT",
				"--field",
				"merge_method=squash",
				"--field",
				"merge_action=default",
			])
		);
	});
});
