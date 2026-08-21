export type PullScope = "all" | "authored" | "reviewing";
export type PullState = "closed" | "merged" | "open";
export type BranchPullRequestState = "all" | "open";
export type IssueScope = "all" | "assigned" | "authored";
export type IssueState = "closed" | "open";
export type MergeMethod = "merge" | "rebase" | "squash";
export type MergeAction = "default" | "direct_merge" | "merge_queue";

export interface PullKey {
	number: number;
	repo: string;
}

export interface IssueKey {
	number: number;
	repo: string;
}

export interface GhRunOptions {
	allowExitCodes?: number[];
	cwd?: string;
}

export interface GhRunner {
	run(args: string[], options?: GhRunOptions): Promise<string>;
}

export interface PullStackEntry {
	author?: { avatarUrl?: string; login?: string; name?: string };
	baseRefName?: string;
	headRefName?: string;
	headRefOid?: string;
	isDraft: boolean;
	mergedAt?: string | null;
	number: number;
	state: string;
	title?: string;
	url?: string;
}

export interface PullStack {
	baseRefName: string;
	createdAt?: string;
	number: number;
	open: boolean;
	pullRequests: PullStackEntry[];
	url?: string;
}

export interface PullSubIssue {
	number: number;
	repository?: { nameWithOwner?: string };
	state: string;
	title: string;
	url?: string;
}
