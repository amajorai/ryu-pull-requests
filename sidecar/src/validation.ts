import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";

import type {
	BranchPullRequestState,
	IssueKey,
	IssueScope,
	IssueState,
	PullKey,
	PullScope,
	PullState,
} from "./types.ts";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_MAX_LENGTH = 256;
const MAX_BODY_LENGTH = 65_000;
const MAX_STACK_PULL_REQUESTS = 100;
const REPOSITORY_NAME_PATTERN = /^(?:[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/;
const REPOSITORY_NAME_MAX_LENGTH = 100;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) {
			return true;
		}
	}
	return false;
}

export function parseBranchLookup(
	cwd: unknown,
	branch: unknown
): {
	branch: string;
	cwd: string;
} {
	if (
		typeof cwd !== "string" ||
		!cwd.trim() ||
		cwd.includes("\0") ||
		!(cwd.startsWith("/") || /^[A-Za-z]:[\\/]/.test(cwd))
	) {
		throw new Error("cwd must be an absolute directory");
	}
	if (
		typeof branch !== "string" ||
		!branch.trim() ||
		branch.length > BRANCH_MAX_LENGTH ||
		hasControlCharacter(branch) ||
		branch.startsWith("-")
	) {
		throw new Error("branch is invalid");
	}
	return { branch: branch.trim(), cwd: cwd.trim() };
}

export function parseBranchLookupState(
	value: string | null
): BranchPullRequestState {
	if (value === null || value === "open") {
		return "open";
	}
	if (value === "all") {
		return "all";
	}
	throw new Error("branch state must be all or open");
}

export function parseRepositoryCwd(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.includes("\0") ||
		!(value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value))
	) {
		throw new Error("cwd must be an absolute directory");
	}
	return value.trim();
}

/**
 * Resolve a repository folder and keep it inside the node user's home.
 *
 * Core applies the caller's manifest permission before the request reaches the
 * sidecar. This second boundary is filesystem-specific: realpath closes `..`
 * and symlink escapes before an authenticated `gh` process can read or publish
 * a different node path.
 */
export async function canonicalRepositoryCwd(
	value: unknown,
	allowedRoot = homedir()
): Promise<string> {
	const requested = parseRepositoryCwd(value);
	let root: string;
	let cwd: string;
	try {
		[root, cwd] = await Promise.all([
			realpath(allowedRoot),
			realpath(requested),
		]);
	} catch {
		throw new Error("cwd could not be resolved on the node");
	}
	const offset = relative(root, cwd);
	if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
		throw new Error("cwd must stay inside the node home directory");
	}
	if (!(await stat(cwd)).isDirectory()) {
		throw new Error("cwd must be a directory");
	}
	return cwd;
}

export function parseRepositoryName(value: unknown): string {
	const name = typeof value === "string" ? value.trim() : "";
	const segments = name.split("/");
	if (
		!name ||
		name.length > REPOSITORY_NAME_MAX_LENGTH ||
		segments.some((segment) => segment.startsWith("-")) ||
		!REPOSITORY_NAME_PATTERN.test(name)
	) {
		throw new Error("repository name is invalid");
	}
	return name;
}

export function parseRepositoryVisibility(
	value: unknown
): "private" | "public" {
	if (value !== "private" && value !== "public") {
		throw new Error("repository visibility must be private or public");
	}
	return value;
}

export function parsePullKey(repo: unknown, number: unknown): PullKey {
	if (typeof repo !== "string" || !REPOSITORY_PATTERN.test(repo)) {
		throw new Error("repository must be owner/name");
	}
	const parsed = typeof number === "number" ? number : Number(number);
	if (!(Number.isSafeInteger(parsed) && parsed > 0)) {
		throw new Error("pull request number must be a positive integer");
	}
	return { repo, number: parsed };
}

export function parseIssueKey(repo: unknown, number: unknown): IssueKey {
	if (typeof repo !== "string" || !REPOSITORY_PATTERN.test(repo)) {
		throw new Error("repository must be owner/name");
	}
	const parsed = typeof number === "number" ? number : Number(number);
	if (!(Number.isSafeInteger(parsed) && parsed > 0)) {
		throw new Error("issue number must be a positive integer");
	}
	return { repo, number: parsed };
}

export function parseStackNumber(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!(Number.isSafeInteger(parsed) && parsed > 0)) {
		throw new Error("stack number must be a positive integer");
	}
	return parsed;
}

export function parseStackPullRequests(value: unknown, minimum = 2): number[] {
	if (
		!Array.isArray(value) ||
		value.length < minimum ||
		value.length > MAX_STACK_PULL_REQUESTS
	) {
		throw new Error(
			`stack must include between ${minimum} and ${MAX_STACK_PULL_REQUESTS} pull requests`
		);
	}
	const numbers = value.map((item) => parseStackNumber(item));
	if (new Set(numbers).size !== numbers.length) {
		throw new Error("stack pull requests must be unique");
	}
	return numbers;
}

export function parseMergeRequestId(value: unknown): string {
	if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
		throw new Error("merge request id must be a UUID");
	}
	return value;
}

export function parseScope(value: string | null): PullScope {
	if (value === null || value === "all") {
		return "all";
	}
	if (value === "authored" || value === "reviewing") {
		return value;
	}
	throw new Error("scope must be all, authored, or reviewing");
}

export function parseState(value: string | null): PullState {
	if (value === null || value === "open") {
		return "open";
	}
	if (value === "closed" || value === "merged") {
		return value;
	}
	throw new Error("state must be open, closed, or merged");
}

export function parseIssueScope(value: string | null): IssueScope {
	if (value === null || value === "all") {
		return "all";
	}
	if (value === "assigned" || value === "authored") {
		return value;
	}
	throw new Error("issue scope must be all, assigned, or authored");
}

export function parseIssueState(value: string | null): IssueState {
	if (value === null || value === "open") {
		return "open";
	}
	if (value === "closed") {
		return "closed";
	}
	throw new Error("issue state must be open or closed");
}

export function parseLimit(value: string | null): number {
	if (value === null) {
		return 50;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw new Error("limit must be an integer");
	}
	return Math.min(Math.max(parsed, 1), 100);
}

export function parseBody(value: unknown, required = true): string {
	if (typeof value !== "string") {
		throw new Error("body must be text");
	}
	const body = value.trim();
	if (required && body.length === 0) {
		throw new Error("body cannot be empty");
	}
	if (body.length > MAX_BODY_LENGTH) {
		throw new Error("body is too long");
	}
	return body;
}
