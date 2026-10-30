import type { IssueSummary, PullSummary } from "./types.ts";

export const timeAgo = (value: string): string => {
	const seconds = Math.max(
		1,
		Math.round((Date.now() - new Date(value).getTime()) / 1000)
	);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m`;
	}
	if (seconds < 86_400) {
		return `${Math.floor(seconds / 3600)}h`;
	}
	if (seconds < 2_592_000) {
		return `${Math.floor(seconds / 86_400)}d`;
	}
	if (seconds < 31_536_000) {
		return `${Math.floor(seconds / 2_592_000)}mo`;
	}
	return `${Math.floor(seconds / 31_536_000)}y`;
};

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
