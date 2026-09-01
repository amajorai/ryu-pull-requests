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

export function pullRequestStatusLabel(status: PullRequestStatus): string {
	return `${status[0]?.toUpperCase() ?? ""}${status.slice(1)} pull request`;
}
