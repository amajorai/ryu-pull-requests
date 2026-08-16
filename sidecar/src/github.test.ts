import { describe, expect, test } from "bun:test";
import { GitHubProvider } from "./github.ts";
import type { GhRunner } from "./types.ts";

class RecordingRunner implements GhRunner {
	readonly calls: string[][] = [];

	constructor(private readonly replies: string[]) {}

	async run(args: string[]): Promise<string> {
		this.calls.push(args);
		return this.replies.shift() ?? "{}";
	}
}

describe("GitHubProvider", () => {
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

	test("adds repository identity and normalizes nullable detail arrays", async () => {
		const runner = new RecordingRunner([
			JSON.stringify({ comments: null, files: null, number: 42 }),
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
		});
	});
});
