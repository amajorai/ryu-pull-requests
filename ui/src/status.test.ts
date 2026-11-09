import { describe, expect, test } from "bun:test";
import { formatMessage } from "@ryu/i18n";
import { pullRequestStatus, pullRequestStatusLabel } from "./status.ts";

const pull = {
	isDraft: false,
	state: "OPEN",
};

describe("pull request status", () => {
	test("distinguishes open, draft, closed, and merged requests", () => {
		expect(pullRequestStatus(pull)).toBe("open");
		expect(pullRequestStatus({ ...pull, isDraft: true })).toBe("draft");
		expect(pullRequestStatus({ ...pull, state: "CLOSED" })).toBe("closed");
		expect(
			pullRequestStatus({
				...pull,
				mergedAt: "2026-08-19T10:00:00Z",
				state: "CLOSED",
			})
		).toBe("merged");
	});

	test("provides an accessible status label", () => {
		expect(
			pullRequestStatusLabel("merged", (source, values) =>
				formatMessage(source, values)
			)
		).toBe("Merged pull request");
	});
});
