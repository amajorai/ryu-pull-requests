import type {
	DeviceAuthStatus,
	IssueDetail,
	IssueSummary,
	ProviderStatus,
	PullDetail,
	PullStack,
	PullSummary,
} from "./types.ts";

export type MergeMethod = "merge" | "rebase" | "squash";
export type MergeAction = "default" | "direct_merge" | "merge_queue";

export interface MergeResult {
	details?: {
		message?: string;
		status?: string;
		uuid?: string;
	};
	status?: string;
}

export interface MutationResult {
	ok: boolean;
	result?: MergeResult;
	stack?: PullStack | null;
}

function bridge() {
	if (!window.ryu?.app?.request) {
		throw new Error("This Ryu build does not provide the app HTTP bridge.");
	}
	return window.ryu.app;
}

const request = <T>(
	method: "DELETE" | "GET" | "POST",
	path: string,
	body?: unknown
): Promise<T> => bridge().request({ method, path, body }) as Promise<T>;

export const getStatus = (): Promise<ProviderStatus> =>
	request("GET", "/status");

export const getDeviceAuth = async (): Promise<DeviceAuthStatus | null> => {
	const result = await request<{ auth: DeviceAuthStatus | null }>(
		"GET",
		"/auth/device"
	);
	return result.auth;
};

export const startDeviceAuth = async (): Promise<DeviceAuthStatus> => {
	const result = await request<{ auth: DeviceAuthStatus }>(
		"POST",
		"/auth/device"
	);
	return result.auth;
};

export const cancelDeviceAuth = async (): Promise<DeviceAuthStatus | null> => {
	const result = await request<{ auth: DeviceAuthStatus | null }>(
		"DELETE",
		"/auth/device"
	);
	return result.auth;
};

export async function listPulls(input: {
	query: string;
	scope: string;
	state: string;
}): Promise<PullSummary[]> {
	const params = new URLSearchParams({
		scope: input.scope,
		state: input.state,
		limit: "50",
	});
	if (input.query.trim()) {
		params.set("q", input.query.trim());
	}
	const result = await request<{ pulls: PullSummary[] }>(
		"GET",
		`/pulls?${params}`
	);
	return result.pulls;
}

export async function listIssues(input: {
	query: string;
	scope: string;
	state: string;
}): Promise<IssueSummary[]> {
	const params = new URLSearchParams({
		scope: input.scope,
		state: input.state,
		limit: "50",
	});
	if (input.query.trim()) {
		params.set("q", input.query.trim());
	}
	const result = await request<{ issues: IssueSummary[] }>(
		"GET",
		`/issues?${params}`
	);
	return result.issues;
}

const keyPath = (repo: string, number: number): string => {
	const [owner, name] = repo.split("/");
	return `/pulls/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${number}`;
};

export const getPull = (repo: string, number: number): Promise<PullDetail> =>
	request("GET", keyPath(repo, number));

const issueKeyPath = (repo: string, number: number): string => {
	const [owner, name] = repo.split("/");
	return `/issues/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${number}`;
};

export const getIssue = (repo: string, number: number): Promise<IssueDetail> =>
	request("GET", issueKeyPath(repo, number));
export const addIssueComment = (
	repo: string,
	number: number,
	body: string
): Promise<{ ok: boolean }> =>
	request("POST", `${issueKeyPath(repo, number)}/comment`, { body });
export const setIssueState = (
	repo: string,
	number: number,
	state: "open" | "closed"
): Promise<{ ok: boolean }> =>
	request("POST", `${issueKeyPath(repo, number)}/state`, { state });

export const getDiff = (
	repo: string,
	number: number
): Promise<{ patch: string; truncated: boolean }> =>
	request("GET", `${keyPath(repo, number)}/diff`);
export const addComment = (
	repo: string,
	number: number,
	body: string
): Promise<{ ok: boolean }> =>
	request("POST", `${keyPath(repo, number)}/comment`, { body });
export const addReview = (
	repo: string,
	number: number,
	action: string,
	body: string
): Promise<{ ok: boolean }> =>
	request("POST", `${keyPath(repo, number)}/review`, { action, body });
export const mergePull = (
	repo: string,
	number: number,
	strategy: MergeMethod,
	auto: boolean,
	mergeAction: MergeAction = "default"
): Promise<MutationResult> =>
	request("POST", `${keyPath(repo, number)}/merge`, {
		auto,
		mergeAction,
		strategy,
	});
export const setDraft = (
	repo: string,
	number: number,
	draft: boolean
): Promise<MutationResult> =>
	request("POST", `${keyPath(repo, number)}/ready`, { draft });

export const createStack = (
	repo: string,
	number: number,
	pullRequests: number[]
): Promise<MutationResult> =>
	request("POST", `${keyPath(repo, number)}/stack`, { pullRequests });

export const addStackLayer = (
	repo: string,
	number: number,
	stackNumber: number,
	pullRequests: number[]
): Promise<MutationResult> =>
	request("POST", `${keyPath(repo, number)}/stack/add`, {
		pullRequests,
		stackNumber,
	});

export const unstack = (
	repo: string,
	number: number,
	stackNumber: number
): Promise<MutationResult> =>
	request("POST", `${keyPath(repo, number)}/stack/unstack`, { stackNumber });

export const getMergeStatus = (
	repo: string,
	number: number,
	requestId: string
): Promise<MergeResult> =>
	request(
		"GET",
		`${keyPath(repo, number)}/merge-async/status?id=${encodeURIComponent(requestId)}`
	);
