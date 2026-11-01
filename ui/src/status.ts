import type { LiteralMessage } from "@ryu/i18n/react";
import type { PullSummary } from "./types.ts";

export type PullRequestStatus = "closed" | "draft" | "merged" | "open";

export function pullRequestStatus(
	pull: Pick<PullSummary, "isDraft" | "state"> & {
		mergedAt?: string | null;
	}
): PullRequestStatus {
	const state = pull.state.toLowerCase();
	if (pull.mergedAt || state === "merged") {
		return "merged";
	}
	if (pull.isDraft) {
		return "draft";
	}
	if (state === "closed") {
		return "closed";
	}
	return "open";
}

export function pullRequestStatusLabel(
	status: PullRequestStatus,
	tl: LiteralMessage
): string {
	if (status === "merged") {
		return tl("Merged pull request");
	}
	if (status === "closed") {
		return tl("Closed pull request");
	}
	if (status === "draft") {
		return tl("Draft pull request");
	}
	return tl("Open pull request");
}
