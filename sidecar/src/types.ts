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

export interface GitHubRepository {
	defaultBranch: string | null;
	nameWithOwner: string;
	url: string;
}

export type RepositoryVisibility = "private" | "public";

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

export type PullFeedbackKind = "comment" | "review" | "review_comment";

/** One conversation comment, review, or open inline review comment. */
export interface PullFeedbackEntry {
	author: string | null;
	/** GitHub's `authorAssociation` (`OWNER`, `MEMBER`, `COLLABORATOR`, …). */
	authorAssociation: string | null;
	/** GraphQL actor type (`User`, `Bot`, …). */
	authorType: string | null;
	body: string;
	createdAt: string | null;
	id: string;
	isMinimized: boolean;
	kind: PullFeedbackKind;
	line: number | null;
	path: string | null;
	state: string | null;
	url: string | null;
	viewerDidAuthor: boolean;
}

/** Light status-and-feedback projection of one pull request. */
export interface PullFeedback {
	commentsCount: number;
	feedback: PullFeedbackEntry[];
	headRefName: string | null;
	headRefOid: string | null;
	isDraft: boolean;
	mergedAt: string | null;
	number: number;
	repository: { nameWithOwner: string };
	state: string | null;
	title: string;
	updatedAt: string | null;
	url: string;
}
