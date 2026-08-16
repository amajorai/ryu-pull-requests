import type {
	DeviceAuthStatus,
	ProviderStatus,
	PullDetail,
	PullSummary,
} from "./types.ts";

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

const keyPath = (repo: string, number: number): string => {
	const [owner, name] = repo.split("/");
	return `/pulls/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${number}`;
};

export const getPull = (repo: string, number: number): Promise<PullDetail> =>
	request("GET", keyPath(repo, number));
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
	strategy: string,
	auto: boolean
): Promise<{ ok: boolean }> =>
	request("POST", `${keyPath(repo, number)}/merge`, { strategy, auto });
export const setDraft = (
	repo: string,
	number: number,
	draft: boolean
): Promise<{ ok: boolean }> =>
	request("POST", `${keyPath(repo, number)}/ready`, { draft });

export function subscribeTheme(): () => void {
	const subscription = window.ryu?.shell?.subscribeTheme?.({
		onChange(tokens) {
			for (const [name, value] of Object.entries(tokens)) {
				if (name.startsWith("--")) {
					document.documentElement.style.setProperty(name, value);
				}
			}
		},
	});
	return () => subscription?.dispose();
}
