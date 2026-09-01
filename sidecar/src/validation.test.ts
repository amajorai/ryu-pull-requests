import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	parseRepositoryCwd,
	parseRepositoryName,
	parseRepositoryVisibility,
	parseScope,
	parseStackNumber,
	parseStackPullRequests,
	parseState,
} from "./validation.ts";

describe("pull request input validation", () => {
	test("accepts an absolute branch lookup cwd", () => {
		expect(parseBranchLookup("/repo", "codex/ci")).toEqual({
			branch: "codex/ci",
			cwd: "/repo",
		});
	});

	test("validates repository publishing inputs", () => {
		expect(parseRepositoryCwd("/repo")).toBe("/repo");
		expect(parseRepositoryName("owner/project")).toBe("owner/project");
		expect(parseRepositoryVisibility("private")).toBe("private");
		expect(() => parseRepositoryCwd("repo")).toThrow("absolute directory");
		expect(() => parseRepositoryName("--help")).toThrow("repository name");
		expect(() => parseRepositoryName(" owner/--help ")).toThrow(
			"repository name"
		);
		expect(() => parseRepositoryVisibility("internal")).toThrow("visibility");
	});

	test("canonicalizes repository folders inside the allowed root", async () => {
		const root = await mkdtemp(join(tmpdir(), "ryu-pr-root-"));
		const repository = join(root, "project");
		await mkdir(repository);
		await expect(canonicalRepositoryCwd(repository, root)).resolves.toBe(
			await realpath(repository)
		);
	});

	test("rejects repository folders and symlinks outside the allowed root", async () => {
		const root = await mkdtemp(join(tmpdir(), "ryu-pr-root-"));
		const outside = await mkdtemp(join(tmpdir(), "ryu-pr-outside-"));
		const escapingSymlink = join(root, "escape");
		await symlink(outside, escapingSymlink);

		await expect(canonicalRepositoryCwd(outside, root)).rejects.toThrow(
			"node home directory"
		);
		await expect(canonicalRepositoryCwd(escapingSymlink, root)).rejects.toThrow(
			"node home directory"
		);
	});

	test("limits branch lookup state to open or all", () => {
		expect(parseBranchLookupState(null)).toBe("open");
		expect(parseBranchLookupState("all")).toBe("all");
		expect(() => parseBranchLookupState("merged")).toThrow(
			"branch state must be all or open"
		);
	});

	test("rejects branch lookup injection-shaped values", () => {
		expect(() => parseBranchLookup("repo", "codex/ci")).toThrow(
			"absolute directory"
		);
		expect(() => parseBranchLookup("/repo", "--repo evil")).toThrow(
			"branch is invalid"
		);
	});

	test("accepts an owner/name key and positive number", () => {
		expect(parsePullKey("openai/codex", "42")).toEqual({
			repo: "openai/codex",
			number: 42,
		});
	});

	test("accepts an issue key and issue filters", () => {
		expect(parseIssueKey("acme/app", "7")).toEqual({
			repo: "acme/app",
			number: 7,
		});
		expect(parseIssueScope("assigned")).toBe("assigned");
		expect(parseIssueState("closed")).toBe("closed");
		expect(() => parseIssueState("merged")).toThrow(
			"issue state must be open or closed"
		);
	});

	test("rejects values that could become gh option injection", () => {
		expect(() => parsePullKey("--repo", 1)).toThrow();
		expect(() => parsePullKey("owner/repo/extra", 1)).toThrow();
		expect(() => parsePullKey("owner/repo", "--help")).toThrow();
	});

	test("bounds list inputs and validates enums", () => {
		expect(parseLimit("999")).toBe(100);
		expect(parseLimit("0")).toBe(1);
		expect(parseScope("reviewing")).toBe("reviewing");
		expect(parseState("merged")).toBe("merged");
		expect(() => parseScope("mine")).toThrow();
	});

	test("trims bodies and rejects empty text", () => {
		expect(parseBody("  looks good  ")).toBe("looks good");
		expect(() => parseBody("   ")).toThrow();
	});

	test("validates stack ordering and merge polling ids", () => {
		expect(parseStackNumber("42")).toBe(42);
		expect(parseStackPullRequests([101, "102"])).toEqual([101, 102]);
		expect(parseStackPullRequests([101], 1)).toEqual([101]);
		expect(
			parseMergeRequestId("630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42")
		).toContain("630b9d5e");
		expect(() => parseStackPullRequests([101, 101])).toThrow("unique");
		expect(() => parseMergeRequestId("not-a-request")).toThrow("UUID");
	});
});
