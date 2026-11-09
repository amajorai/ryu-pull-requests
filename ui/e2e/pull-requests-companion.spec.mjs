import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
	expect,
	test,
} from "../../../../apps/desktop/node_modules/@playwright/test/index.mjs";

const BASE_URL = "http://127.0.0.1:49384";
const EVIDENCE = path.join(import.meta.dirname, "evidence");

async function mountApp(page, { authenticated, denyClipboard = false, view }) {
	await page.clock.install({ time: new Date("2026-09-30T12:00:00.000Z") });
	await page.addInitScript(
		({
			authenticated: isAuthenticated,
			denyClipboard: deny,
			requestedView,
		}) => {
			const timestamp = "2026-09-30T12:00:00.000Z";
			const repository = { nameWithOwner: "octo/ryu" };
			const author = { login: "proof-reviewer", name: "Proof Reviewer" };
			const pull = {
				author,
				commentsCount: 2,
				createdAt: timestamp,
				isDraft: false,
				labels: [{ color: "1f6feb", name: "stacked" }],
				mergedAt: null,
				number: 101,
				repository,
				state: "OPEN",
				title: "Stacked billing change",
				updatedAt: timestamp,
				url: "https://github.com/octo/ryu/pull/101",
			};
			const detail = {
				...pull,
				additions: 12,
				assignees: [],
				baseRefName: "main",
				body: "The first layer adds a stable retry key.",
				changedFiles: 1,
				closingIssuesReferences: [],
				comments: [],
				deletions: 1,
				diffPatch: "diff --git a/retry.ts b/retry.ts",
				files: [{ additions: 12, deletions: 1, path: "src/retry.ts" }],
				headRefName: "fix/stable-retry-key",
				latestReviews: [],
				mergeable: "MERGEABLE",
				mergeStateStatus: "CLEAN",
				reviewDecision: "APPROVED",
				reviewRequests: [],
				stack: {
					baseRefName: "main",
					number: 900,
					open: true,
					pullRequests: [
						{
							baseRefName: "main",
							headRefName: "fix/retry-foundation",
							isDraft: false,
							mergedAt: null,
							number: 100,
							state: "OPEN",
							title: "Retry foundation",
							url: "https://github.com/octo/ryu/pull/100",
						},
						{
							baseRefName: "fix/retry-foundation",
							headRefName: "fix/stable-retry-key",
							isDraft: false,
							mergedAt: null,
							number: 101,
							state: "OPEN",
							title: pull.title,
							url: pull.url,
						},
					],
				},
				statusCheckRollup: [],
				subIssues: [],
			};
			const state = {
				auth: null,
				authenticated: isAuthenticated,
				openedExternal: [],
				requests: [],
			};
			Object.defineProperty(window, "__pullRequestsPackageProof", {
				configurable: false,
				value: state,
			});
			if (deny) {
				Object.defineProperty(navigator, "clipboard", {
					configurable: true,
					value: {
						writeText: async () => {
							throw new DOMException(
								"Clipboard denied by fixture",
								"NotAllowedError"
							);
						},
					},
				});
			}

			const clone = (value) => structuredClone(value);
			const app = {
				request: async ({ body, method = "GET", path: requestPath }) => {
					state.requests.push({ body: clone(body), method, path: requestPath });
					if (requestPath === "/status" && method === "GET") {
						if (!state.authenticated) {
							throw new Error("GitHub CLI is not authenticated.");
						}
						return {
							available: true,
							provider: "github",
							version: "fixture",
							viewer: { login: "proof-reviewer", name: "Proof Reviewer" },
						};
					}
					if (requestPath === "/auth/device" && method === "GET") {
						return { auth: clone(state.auth) };
					}
					if (requestPath === "/auth/device" && method === "POST") {
						state.auth = {
							expiresAt: "2026-09-30T13:00:00.000Z",
							id: "device-auth-local-fixture",
							startedAt: timestamp,
							state: "pending",
							userCode: "ABCD-EFGH",
							verificationUri: "https://github.com/login/device",
						};
						return { auth: clone(state.auth) };
					}
					if (requestPath === "/auth/device" && method === "DELETE") {
						state.auth = { ...state.auth, state: "cancelled" };
						return { auth: clone(state.auth) };
					}
					if (requestPath.startsWith("/pulls?") && method === "GET") {
						return { pulls: [pull] };
					}
					if (requestPath === "/pulls/octo/ryu/101" && method === "GET") {
						return clone(detail);
					}
					if (
						requestPath === "/pulls/octo/ryu/101/merge" &&
						method === "POST"
					) {
						return {
							ok: true,
							result: {
								details: { message: "Accepted by local bridge fixture." },
								status: "queued",
							},
						};
					}
					throw new Error(
						`Unhandled local Pull Requests route ${method} ${requestPath}`
					);
				},
			};
			const bridge = {
				app,
				context: { view: requestedView },
				ui: {
					openExternal: async ({ url }) => {
						state.openedExternal.push(url);
					},
				},
			};
			Object.defineProperty(window, "ryu", {
				configurable: true,
				value: bridge,
			});
		},
		{ authenticated, denyClipboard, view }
	);
	await page.goto("/index.html");
}

async function capture(page, name) {
	await mkdir(EVIDENCE, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(EVIDENCE, name),
	});
}

async function fixtureState(page) {
	return page.evaluate(() => window.__pullRequestsPackageProof);
}

test("copying a one-time GitHub code writes the exact code to the local clipboard", async ({
	page,
}) => {
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
		origin: BASE_URL,
	});
	await mountApp(page, { authenticated: false, view: "issues" });
	await expect(
		page.getByRole("heading", { name: "Connect GitHub" })
	).toBeVisible();
	await page.getByRole("button", { name: "Sign in with GitHub" }).click();
	const codeButton = page.getByRole("button", {
		name: "Copy one-time GitHub code",
	});
	await expect(codeButton).toContainText("ABCD-EFGH");
	await expect
		.poll(async () => (await fixtureState(page)).openedExternal)
		.toEqual(["https://github.com/login/device"]);
	await codeButton.click();
	await expect(codeButton).toContainText("Copied");
	await expect(
		page.evaluate(() => navigator.clipboard.readText())
	).resolves.toBe("ABCD-EFGH");
	const state = await fixtureState(page);
	expect(
		state.requests.some(
			(request) => request.method === "POST" && request.path === "/auth/device"
		)
	).toBe(true);
	await capture(page, "pull-requests-package-device-code-copied.png");
});

test("denied clipboard access leaves the GitHub code selected for manual copying", async ({
	page,
}) => {
	await mountApp(page, {
		authenticated: false,
		denyClipboard: true,
		view: "issues",
	});
	await page.getByRole("button", { name: "Sign in with GitHub" }).click();
	const codeButton = page.getByRole("button", {
		name: "Copy one-time GitHub code",
	});
	await expect(codeButton).toContainText("ABCD-EFGH");
	await codeButton.click();
	await expect(
		page.getByText("Select the code and copy it manually.")
	).toBeVisible();
	const manualCode = page.getByRole("textbox", {
		name: "One-time GitHub code",
	});
	await expect(manualCode).toHaveValue("ABCD-EFGH");
	await expect(manualCode).toBeFocused();
	expect(
		await manualCode.evaluate((node) => {
			const input = node;
			return (
				input.selectionStart === 0 && input.selectionEnd === input.value.length
			);
		})
	).toBe(true);
	await capture(page, "pull-requests-package-device-code-manual-fallback.png");
});

test("Queue stack submits the exact merge-queue request and shows local submission feedback", async ({
	page,
}) => {
	await mountApp(page, { authenticated: true, view: "pulls" });
	const pullRow = page
		.getByRole("listbox", { name: "Pull requests" })
		.getByRole("option", { name: /Stacked billing change octo\/ryu · #101/ });
	await expect(pullRow).toBeVisible();
	await pullRow.click();
	await expect(pullRow).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByRole("heading", { name: "Stacked billing change" })
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "Stack #900" })).toBeVisible();
	await page.getByRole("button", { name: "Merge stack", exact: true }).click();
	const queueAction = page.getByRole("menuitem", {
		name: "Queue stack through #101",
	});
	await expect(queueAction).toBeVisible();
	await capture(page, "pull-requests-package-merge-queue-menu.png");
	await queueAction.click();
	await expect(page.getByRole("status")).toContainText(
		"Queue stack through #101 submitted."
	);
	const state = await fixtureState(page);
	expect(
		state.requests.filter((request) => request.method === "POST")
	).toHaveLength(1);
	const mergeRequest = state.requests.find(
		(request) =>
			request.method === "POST" && request.path === "/pulls/octo/ryu/101/merge"
	);
	expect(mergeRequest).toEqual({
		body: { auto: true, mergeAction: "merge_queue", strategy: "squash" },
		method: "POST",
		path: "/pulls/octo/ryu/101/merge",
	});
	await page.evaluate(() => document.fonts.ready);
	const stackRows = page.locator(".stack-map .stack-layer");
	await expect(stackRows).toHaveCount(2);
	const rowBounds = [];
	for (let index = 0; index < 2; index += 1) {
		const row = stackRows.nth(index);
		const bounds = await row.boundingBox();
		expect(bounds).not.toBeNull();
		rowBounds.push(bounds);
		for (const selector of [
			".stack-layer-index",
			".stack-layer-copy strong",
			".stack-layer-copy small",
			".stack-state",
		]) {
			const child = row.locator(selector);
			await expect(child).toBeVisible();
			const childBounds = await child.boundingBox();
			expect(childBounds).not.toBeNull();
			expect(childBounds.width).toBeGreaterThan(0);
			expect(childBounds.height).toBeGreaterThan(0);
			expect(childBounds.x).toBeGreaterThanOrEqual(bounds.x - 1);
			expect(childBounds.y).toBeGreaterThanOrEqual(bounds.y - 1);
			expect(childBounds.x + childBounds.width).toBeLessThanOrEqual(
				bounds.x + bounds.width + 1
			);
			expect(childBounds.y + childBounds.height).toBeLessThanOrEqual(
				bounds.y + bounds.height + 1
			);
		}
	}
	expect(rowBounds[1].y).toBeGreaterThanOrEqual(
		rowBounds[0].y + rowBounds[0].height
	);
	const branchSummary = await page.locator(".summary-grid").boundingBox();
	expect(branchSummary).not.toBeNull();
	expect(branchSummary.y).toBeGreaterThanOrEqual(
		rowBounds[1].y + rowBounds[1].height
	);
	await capture(page, "pull-requests-package-merge-queue-local-submission.png");
});
