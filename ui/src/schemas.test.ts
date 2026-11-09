import { expect, test } from "bun:test";
import { providerStatus, pullDetail } from "./api-fixtures.ts";
import { providerStatusSchema, pullDetailSchema } from "./schemas.ts";

test("preserves complete native records, nullable actors and additive JSON identity", () => {
	const extra = JSON.parse('{"__proto__":{"future":true},"overflow":1e400}');
	const record = { ...pullDetail, future: extra };
	expect(pullDetailSchema.parse(record)).toBe(record);
	expect(pullDetailSchema.parse(record).files).toBe(record.files);
	expect(providerStatusSchema.parse(providerStatus)).toBe(providerStatus);
	expect(providerStatus.viewer.name).toBeNull();
});

test("rejects incomplete or malformed renderer inputs rather than casting native replies", () => {
	expect(providerStatusSchema.safeParse({ ok: true }).success).toBe(false);
	expect(
		pullDetailSchema.safeParse({
			...pullDetail,
			files: [{ path: "README.md", additions: "1", deletions: 0 }],
		}).success
	).toBe(false);
	expect(
		pullDetailSchema.safeParse({ ...pullDetail, commentsCount: undefined })
			.success
	).toBe(false);
	expect(
		pullDetailSchema.safeParse({ ...pullDetail, author: null }).success
	).toBe(true);
});

test("accepts pending native check runs and unpublished reviews with nullable fields", () => {
	const value = {
		...pullDetail,
		latestReviews: [
			{ author: null, body: null, state: "PENDING", submittedAt: null },
		],
		statusCheckRollup: [
			{ conclusion: null, detailsUrl: null, name: "CI", status: "IN_PROGRESS" },
		],
	};
	expect(pullDetailSchema.parse(value)).toBe(value);
	expect(pullDetailSchema.parse(value).latestReviews).toBe(value.latestReviews);
	expect(pullDetailSchema.parse(value).statusCheckRollup).toBe(
		value.statusCheckRollup
	);
});
