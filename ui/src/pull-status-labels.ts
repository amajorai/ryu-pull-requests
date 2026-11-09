import type { LiteralMessage } from "@ryu/i18n/react";
import type { PullDetail } from "./types.ts";

// GitHub reports merge and review state as GraphQL enums. Each value maps to
// one whole translated message here so the review overview never prints an
// English pill or a lowercased raw enum.

/** Pill text for `PullRequest.mergeable` (MERGEABLE / CONFLICTING / UNKNOWN). */
export function mergeStatusLabel(
	mergeable: string,
	tl: LiteralMessage
): string {
	if (mergeable === "MERGEABLE") {
		return tl("No conflicts");
	}
	if (mergeable === "CONFLICTING") {
		return tl("Conflicts found");
	}
	return tl("Checking mergeability");
}

/** Pill text for the pull request's overall review decision. */
export function reviewDecisionLabel(
	detail: Pick<PullDetail, "isDraft" | "reviewDecision">,
	tl: LiteralMessage
): string {
	if (detail.isDraft) {
		return tl("Draft");
	}
	switch (detail.reviewDecision) {
		case "APPROVED":
			return tl("Approved");
		case "CHANGES_REQUESTED":
			return tl("Changes requested");
		case "REVIEW_REQUIRED":
			return tl("Review required");
		default:
			return tl("Review in progress");
	}
}

/** The requested-reviewer state, before a reviewer has submitted a review. */
export const REVIEW_REQUESTED_STATE = "REVIEW_REQUESTED";

/**
 * State beside each reviewer: a `PullRequestReviewState`, or
 * `REVIEW_REQUESTED_STATE` for a pending request. An unknown value prints
 * as GitHub sent it, lowercased, rather than a misleading translation.
 */
export function reviewerStateLabel(state: string, tl: LiteralMessage): string {
	switch (state) {
		case REVIEW_REQUESTED_STATE:
			return tl("Review requested");
		case "APPROVED":
			return tl("Approved");
		case "CHANGES_REQUESTED":
			return tl("Changes requested");
		case "COMMENTED":
			return tl("Commented");
		case "DISMISSED":
			return tl("Review dismissed");
		case "PENDING":
			return tl("Review pending");
		default:
			return rawEnumText(state);
	}
}

/** Note under the merge pill for `PullRequest.mergeStateStatus`. */
export function mergeStateLabel(status: string, tl: LiteralMessage): string {
	switch (status) {
		case "BEHIND":
			return tl("The head branch is behind the base branch");
		case "BLOCKED":
			return tl("Merging is blocked");
		case "CLEAN":
			return tl("Ready to merge");
		case "DIRTY":
			return tl("Merge conflicts must be resolved");
		case "DRAFT":
			return tl("Draft pull requests cannot be merged");
		case "HAS_HOOKS":
			return tl("Ready to merge; pre-receive hooks will run");
		case "UNSTABLE":
			return tl("Mergeable with failing or pending checks");
		case "UNKNOWN":
			return tl("Merge state is still being calculated");
		default:
			return rawEnumText(status);
	}
}

function rawEnumText(value: string): string {
	return value.replaceAll("_", " ").toLowerCase();
}
