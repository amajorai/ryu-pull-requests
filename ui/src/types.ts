export interface Actor {
	avatarUrl?: string;
	login?: string;
	name?: string;
}
export interface Repository {
	nameWithOwner: string;
}
export interface Label {
	color?: string;
	name: string;
}

export interface PullSummary {
	author?: Actor;
	commentsCount: number;
	createdAt: string;
	isDraft: boolean;
	labels: Label[];
	mergedAt?: string | null;
	number: number;
	repository: Repository;
	state: string;
	title: string;
	updatedAt: string;
	url: string;
}

export interface PullFile {
	additions: number;
	deletions: number;
	path: string;
}
export interface PullComment {
	author?: Actor;
	body: string;
	createdAt: string;
	url?: string;
}
export interface PullReview {
	author?: Actor;
	body?: string;
	state: string;
	submittedAt?: string;
}

export interface PullIssueReference {
	number: number;
	repository?: Repository;
	state?: string;
	title?: string;
	url?: string;
}

export interface PullStackEntry {
	author?: Actor;
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

export interface IssueSummary {
	author?: Actor;
	closedAt?: string | null;
	commentsCount: number;
	createdAt: string;
	labels: Label[];
	number: number;
	repository: Repository;
	state: string;
	title: string;
	updatedAt: string;
	url: string;
}
export interface IssueComment {
	author?: Actor;
	body: string;
	createdAt: string;
	url?: string;
}
export interface IssueDetail extends IssueSummary {
	assignees: Actor[];
	body: string;
	comments: IssueComment[];
}
export interface PullCheck {
	bucket?: string;
	conclusion?: string;
	detailsUrl?: string;
	name?: string;
	state?: string;
	status?: string;
	workflowName?: string;
}

export interface PullDetail extends PullSummary {
	additions: number;
	assignees: Actor[];
	baseRefName: string;
	body: string;
	changedFiles: number;
	closingIssuesReferences: PullIssueReference[];
	comments: PullComment[];
	deletions: number;
	files: PullFile[];
	headRefName: string;
	latestReviews: PullReview[];
	mergeable: string;
	mergedAt?: string | null;
	mergeStateStatus: string;
	reviewDecision: string;
	reviewRequests: Array<{ requestedReviewer?: Actor }>;
	stack: PullStack | null;
	statusCheckRollup: PullCheck[];
	subIssues: PullSubIssue[];
}

export interface ProviderStatus {
	available: boolean;
	provider: string;
	version: string;
	viewer: Actor;
}

export interface DeviceAuthStatus {
	expiresAt: string;
	id: string;
	message?: string;
	startedAt: string;
	state: "starting" | "pending" | "success" | "error" | "cancelled";
	userCode?: string;
	verificationUri?: string;
}
