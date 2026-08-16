import type { PullKey, PullScope, PullState } from "./types.ts";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_BODY_LENGTH = 65_000;

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
