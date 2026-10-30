import { describe, expect, test } from "bun:test";
import { parsePullRequestLink } from "./pull-request-link.ts";

describe("GitHub pull request links", () => {
	test("parses a GitHub pull request URL, including a diff subpath", () => {
		expect(
			parsePullRequestLink("https://github.com/alice/project/pull/42/files")
		).toEqual({ owner: "alice", repository: "project", number: 42 });
	});

	test("rejects non-GitHub hosts, insecure URLs, issues, and invalid numbers", () => {
		for (const value of [
			"http://github.com/alice/project/pull/42",
			"https://github.com.evil.test/alice/project/pull/42",
			"https://github.com/alice/project/issues/42",
			"https://github.com/alice/project/pull/0",
			"not a URL",
		]) {
			expect(parsePullRequestLink(value)).toBeNull();
		}
	});
});
