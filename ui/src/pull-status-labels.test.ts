import { describe, expect, test } from "bun:test";
import { formatMessage } from "@ryu/i18n";
import type { LiteralMessage } from "@ryu/i18n/react";
import {
	mergeStateLabel,
	mergeStatusLabel,
	REVIEW_REQUESTED_STATE,
	reviewDecisionLabel,
	reviewerStateLabel,
} from "./pull-status-labels.ts";

const english: LiteralMessage = (source, values) =>
	formatMessage(source, values);
// Marks every string that went through tl(), so a raw enum stands out.
const marked: LiteralMessage = (source) => `«${source}»`;

describe("mergeStatusLabel", () => {
	test("maps every mergeable value to a whole message", () => {
		expect(mergeStatusLabel("MERGEABLE", english)).toBe("No conflicts");
		expect(mergeStatusLabel("CONFLICTING", english)).toBe("Conflicts found");
		expect(mergeStatusLabel("UNKNOWN", english)).toBe("Checking mergeability");
	});

	test("treats an unrecognised value as still checking", () => {
		expect(mergeStatusLabel("SOMETHING_NEW", marked)).toBe(
			"«Checking mergeability»"
		);
	});
});

describe("reviewDecisionLabel", () => {
	const decision = (reviewDecision: string, isDraft = false) =>
		reviewDecisionLabel({ isDraft, reviewDecision }, english);

	test("maps every review decision", () => {
		expect(decision("APPROVED")).toBe("Approved");
		expect(decision("CHANGES_REQUESTED")).toBe("Changes requested");
		expect(decision("REVIEW_REQUIRED")).toBe("Review required");
		expect(decision("")).toBe("Review in progress");
	});

	test("a draft wins over any decision", () => {
		expect(decision("APPROVED", true)).toBe("Draft");
	});

	test("an unknown decision falls back to a translated message", () => {
		expect(
			reviewDecisionLabel({ isDraft: false, reviewDecision: "NEW" }, marked)
		).toBe("«Review in progress»");
	});
});

describe("reviewerStateLabel", () => {
	test("maps every review state to a translated message", () => {
		const cases: [string, string][] = [
			[REVIEW_REQUESTED_STATE, "Review requested"],
			["APPROVED", "Approved"],
			["CHANGES_REQUESTED", "Changes requested"],
			["COMMENTED", "Commented"],
			["DISMISSED", "Review dismissed"],
			["PENDING", "Review pending"],
		];
		for (const [state, label] of cases) {
			expect(reviewerStateLabel(state, marked)).toBe(`«${label}»`);
		}
	});

	test("prints an unknown state as GitHub sent it", () => {
		expect(reviewerStateLabel("NEW_STATE", marked)).toBe("new state");
	});
});

describe("mergeStateLabel", () => {
	test("maps every merge state status to a translated message", () => {
		for (const status of [
			"BEHIND",
			"BLOCKED",
			"CLEAN",
			"DIRTY",
			"DRAFT",
			"HAS_HOOKS",
			"UNSTABLE",
			"UNKNOWN",
		]) {
			expect(mergeStateLabel(status, marked)).toMatch(/^«.+»$/u);
		}
		expect(mergeStateLabel("CLEAN", english)).toBe("Ready to merge");
		expect(mergeStateLabel("BLOCKED", english)).toBe("Merging is blocked");
	});

	test("prints an unknown status as GitHub sent it", () => {
		expect(mergeStateLabel("SOME_NEW_STATUS", marked)).toBe("some new status");
	});
});
