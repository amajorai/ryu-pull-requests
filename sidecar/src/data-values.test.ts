import { expect, test } from "bun:test";
import {
	type GitHubDataRecord,
	type GitHubDataValue,
	githubDataArraySchema,
	githubDataRecordSchema,
	githubDataValueSchema,
} from "./data-values.ts";

test("retains complete native JSON, own __proto__, overflow and original references", () => {
	const value = githubDataRecordSchema.parse(
		JSON.parse(
			'{"__proto__":{"future":true},"overflow":1e400,"negative":-1e400,"rows":[null,false,"",{}]}'
		)
	);
	expect(Object.hasOwn(value, "__proto__")).toBe(true);
	expect(value.overflow).toBe(Number.POSITIVE_INFINITY);
	expect(value.negative).toBe(Number.NEGATIVE_INFINITY);
	expect(githubDataRecordSchema.parse(value)).toBe(value);
	expect(githubDataValueSchema.parse(value.rows)).toBe(value.rows);
	expect<GitHubDataValue>(githubDataArraySchema.parse(value.rows)).toBe(
		value.rows
	);
});

test("validates deeply nested additive GitHub JSON iteratively", () => {
	const value: GitHubDataRecord = {};
	let child = value;
	for (let depth = 0; depth < 20_000; depth += 1) {
		const next: GitHubDataRecord = {};
		child.future = next;
		child = next;
	}
	child.field = "preserved";
	expect(githubDataRecordSchema.parse(value)).toBe(value);
});

test("allows absent publisher fields and shared JSON references while refusing cycles and opaque objects", () => {
	const nested = { future: true };
	const value = { missing: undefined, left: nested, right: nested };
	expect(githubDataRecordSchema.parse(value)).toBe(value);
	expect(githubDataValueSchema.parse(undefined)).toBeUndefined();
	const cyclic: GitHubDataRecord = {};
	cyclic.self = cyclic;
	expect(githubDataValueSchema.safeParse(cyclic).success).toBe(false);
	expect(githubDataValueSchema.safeParse(new Date()).success).toBe(false);
	expect(githubDataValueSchema.safeParse(Number.NaN).success).toBe(false);
	expect(githubDataValueSchema.safeParse(() => 1).success).toBe(false);
	expect(githubDataRecordSchema.safeParse([]).success).toBe(false);
});

test("rejects accessors without executing external fields", () => {
	let calls = 0;
	const value = Object.defineProperty({}, "future", {
		enumerable: true,
		get() {
			calls += 1;
			return "unexpected";
		},
	});
	expect(githubDataRecordSchema.safeParse(value).success).toBe(false);
	expect(calls).toBe(0);
});
