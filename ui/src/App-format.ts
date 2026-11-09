import { activeLocale, formatCompactAge } from "@ryu/i18n/core";
import type { IssueSummary, PullSummary } from "./types.ts";

/** A list badge's age ("now", "5m", "3h", "2d") in the shown locale. */
export const timeAgo = (value: string): string =>
	formatCompactAge(activeLocale(), value);

export const errorText = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);
export const repoName = (pull: PullSummary): string =>
	pull.repository.nameWithOwner;
export const issueRepoName = (issue: IssueSummary): string =>
	issue.repository.nameWithOwner;
export const wait = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

export function parseStackInput(value: string): number[] {
	return value
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((item) => Number(item));
}
