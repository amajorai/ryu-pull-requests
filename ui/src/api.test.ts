import { afterEach, describe, expect, test } from "bun:test";
import type { GitHubDataValue } from "../../sidecar/src/data-values.ts";
import {
	addComment,
	addIssueComment,
	addReview,
	addStackLayer,
	cancelDeviceAuth,
	createStack,
	getDeviceAuth,
	getDiff,
	getIssue,
	getMergeStatus,
	getPull,
	getStatus,
	listIssues,
	listPulls,
	mergePull,
	setDraft,
	setIssueState,
	startDeviceAuth,
	unstack,
} from "./api.ts";
import {
	issueDetail,
	pendingAuth,
	providerStatus,
	pullDetail,
} from "./api-fixtures.ts";

interface BridgeRequest {
	body?: GitHubDataValue;
	method: "DELETE" | "GET" | "POST";
	path: string;
}

const originalWindow = globalThis.window;

afterEach(() => {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: originalWindow,
		writable: true,
	});
});

function installBridge(
	request?: (input: BridgeRequest) => Promise<GitHubDataValue>
): void {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { ryu: { app: { request } } },
		writable: true,
	});
}

describe("pull request Companion HTTP caller", () => {
	test("refuses every operation when the host app bridge is unavailable", () => {
		installBridge();
		expect(() => getStatus()).toThrow(
			"This Ryu build does not provide the app HTTP bridge."
		);
	});

	test("sends each read and mutation through the exact generic app route", async () => {
		const calls: BridgeRequest[] = [];
		installBridge(async (input) => {
			calls.push(structuredClone(input));
			if (input.path === "/auth/device") {
				return { auth: pendingAuth };
			}
			if (input.path === "/status") {
				return providerStatus;
			}
			if (input.path.endsWith("/diff")) {
				return { patch: "", truncated: false };
			}
			if (input.path.includes("/merge-async/status")) {
				return { status: "pending" };
			}
			if (input.path === "/pulls/space%20owner/repo%20name/12") {
				return pullDetail;
			}
			if (input.path === "/issues/space%20owner/repo%20name/8") {
				return issueDetail;
			}
			if (input.path.startsWith("/pulls?")) {
				return { pulls: [] };
			}
			if (input.path.startsWith("/issues?")) {
				return { issues: [] };
			}
			return { ok: true };
		});

		await getStatus();
		await getDeviceAuth();
		await startDeviceAuth();
		await cancelDeviceAuth();
		await listPulls({
			query: "  retry key  ",
			scope: "review-requested",
			state: "open",
		});
		await listIssues({ query: "", scope: "assigned", state: "closed" });
		await getPull("space owner/repo name", 12);
		await getDiff("space owner/repo name", 12);
		await addComment("space owner/repo name", 12, "ship it");
		await addReview(
			"space owner/repo name",
			12,
			"request_changes",
			"needs a test"
		);
		await mergePull("space owner/repo name", 12, "squash", true, "merge_queue");
		await setDraft("space owner/repo name", 12, false);
		await createStack("space owner/repo name", 12, [10, 11, 12]);
		await addStackLayer("space owner/repo name", 12, 90, [13]);
		await unstack("space owner/repo name", 12, 90);
		await getMergeStatus("space owner/repo name", 12, "request/id");
		await getIssue("space owner/repo name", 8);
		await addIssueComment("space owner/repo name", 8, "confirmed");
		await setIssueState("space owner/repo name", 8, "closed");

		expect(calls).toEqual([
			{ method: "GET", path: "/status" },
			{ method: "GET", path: "/auth/device" },
			{ method: "POST", path: "/auth/device" },
			{ method: "DELETE", path: "/auth/device" },
			{
				method: "GET",
				path: "/pulls?scope=review-requested&state=open&limit=50&q=retry+key",
			},
			{ method: "GET", path: "/issues?scope=assigned&state=closed&limit=50" },
			{ method: "GET", path: "/pulls/space%20owner/repo%20name/12" },
			{ method: "GET", path: "/pulls/space%20owner/repo%20name/12/diff" },
			{
				body: { body: "ship it" },
				method: "POST",
				path: "/pulls/space%20owner/repo%20name/12/comment",
			},
			{
				body: { action: "request_changes", body: "needs a test" },
				method: "POST",
				path: "/pulls/space%20owner/repo%20name/12/review",
			},
			{
				body: { auto: true, mergeAction: "merge_queue", strategy: "squash" },
				method: "POST",
				path: "/pulls/space%20owner/repo%20name/12/merge",
			},
			{
				body: { draft: false },
				method: "POST",
				path: "/pulls/space%20owner/repo%20name/12/ready",
			},
			{
				body: { pullRequests: [10, 11, 12] },
				method: "POST",
				path: "/pulls/space%20owner/repo%20name/12/stack",
			},
			{
				body: { pullRequests: [13], stackNumber: 90 },
				method: "POST",
				path: "/pulls/space%20owner/repo%20name/12/stack/add",
			},
			{
				body: { stackNumber: 90 },
				method: "POST",
				path: "/pulls/space%20owner/repo%20name/12/stack/unstack",
			},
			{
				method: "GET",
				path: "/pulls/space%20owner/repo%20name/12/merge-async/status?id=request%2Fid",
			},
			{ method: "GET", path: "/issues/space%20owner/repo%20name/8" },
			{
				body: { body: "confirmed" },
				method: "POST",
				path: "/issues/space%20owner/repo%20name/8/comment",
			},
			{
				body: { state: "closed" },
				method: "POST",
				path: "/issues/space%20owner/repo%20name/8/state",
			},
		]);
	});

	test("propagates a refused mutation and retries the identical request exactly once", async () => {
		const calls: BridgeRequest[] = [];
		installBridge(async (input) => {
			calls.push(structuredClone(input));
			if (calls.length === 1) {
				throw new Error("review permission denied");
			}
			return { ok: true };
		});

		await expect(addComment("octo/ryu", 7, "please retry")).rejects.toThrow(
			"review permission denied"
		);
		await expect(addComment("octo/ryu", 7, "please retry")).resolves.toEqual({
			ok: true,
		});
		expect(calls).toHaveLength(2);
		expect(calls[1]).toEqual(calls[0]);
	});
});
