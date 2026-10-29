import { expect, test } from "bun:test";
import {
	githubMergeResultSchema,
	githubPullRecordSchema,
} from "./github-records.ts";

test("preserves legitimate partial legacy projections and native additive GitHub fields", () => {
	const future = JSON.parse('{"__proto__":{"flag":true},"overflow":1e400}');
	const pull = {
		author: null,
		comments: null,
		files: null,
		number: 42,
		future,
	};
	expect(githubPullRecordSchema.parse(pull)).toBe(pull);
	expect(githubPullRecordSchema.parse(pull).future).toBe(future);
	expect(githubPullRecordSchema.safeParse({}).success).toBe(true);
});

test("refuses malformed known fields without stripping future GitHub response metadata", () => {
	expect(githubPullRecordSchema.safeParse({ number: "42" }).success).toBe(
		false
	);
	expect(githubPullRecordSchema.safeParse({ isDraft: "false" }).success).toBe(
		false
	);
	expect(
		githubPullRecordSchema.safeParse({ comments: [{ body: 1 }] }).success
	).toBe(false);
	const result = {
		details: { uuid: "request-1", status: "pending", future: [1, null] },
		future: true,
	};
	expect(githubMergeResultSchema.parse(result)).toBe(result);
	expect(githubMergeResultSchema.parse(result)?.details).toBe(result.details);
	expect(githubMergeResultSchema.parse(undefined)).toBeUndefined();
});
