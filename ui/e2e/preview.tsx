import {
	markCompanionAppRoot,
	subscribeCompanionTheme,
} from "@ryu/app-host/companion-theme";
import { RyuAppShell } from "@ryu/blocks/companion/app-ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { GitHubDataRecord } from "../../sidecar/src/data-values.ts";
import { App } from "../src/App.tsx";
import type {} from "../src/ryu.d.ts";
import "../src/styles.css";

const now = "2026-09-30T02:00:00Z";

function buildPull(
	number: number,
	title: string,
	author: string,
	body: string,
	files: Array<{ additions: number; deletions: number; path: string }>,
	checks: Array<{ bucket: string; name: string; state: string }>
) {
	return {
		additions: files.reduce((total, file) => total + file.additions, 0),
		assignees: [],
		author: { login: author },
		baseRefName: "main",
		body,
		changedFiles: files.length,
		closingIssuesReferences: [],
		comments: [
			{
				author: { login: "sana" },
				body: "The readiness timeout now has a clear upper bound. Could we verify the direct-server fallback still reconnects after the timeout?",
				createdAt: now,
			},
		],
		commentsCount: 1,
		createdAt: "2026-09-29T16:00:00Z",
		deletions: files.reduce((total, file) => total + file.deletions, 0),
		files,
		headRefName: "fix/broker-timeout",
		isDraft: false,
		labels: [{ color: "1d76db", name: "reliability" }],
		latestReviews: [
			{
				author: { login: "sana" },
				body: "Please confirm the slow-connect fallback remains covered.",
				state: "COMMENTED",
				submittedAt: now,
			},
		],
		mergeable: "MERGEABLE",
		mergeStateStatus: "BLOCKED",
		number,
		repository: { nameWithOwner: "acme/desktop" },
		reviewDecision: "REVIEW_REQUIRED",
		reviewRequests: [{ requestedReviewer: { login: "marco" } }],
		stack: null,
		state: "OPEN",
		statusCheckRollup: checks,
		subIssues: [],
		title,
		updatedAt: now,
		url: `https://github.com/acme/desktop/pull/${number}`,
	};
}

const checks = [
	{ bucket: "pass", name: "unit tests", state: "SUCCESS" },
	{ bucket: "fail", name: "type-check + lint", state: "FAILURE" },
	{ bucket: "pending", name: "security scan", state: "IN_PROGRESS" },
];
const files = [
	{ additions: 48, deletions: 6, path: "src/main/broker/readiness.ts" },
	{ additions: 22, deletions: 1, path: "src/main/broker/client.ts" },
	{ additions: 13, deletions: 1, path: "src/main/broker/readiness.test.ts" },
];
const detail = buildPull(
	773,
	"fix: bound hung broker connects and recover cleanly",
	"jules",
	"## Problem\nA broker that remains in a connecting state could keep companion requests waiting indefinitely.\n\n## Change\nBound each readiness probe, clean up timed-out sockets, and keep healthy connections on the fast path.\n\n## Verification\n- [x] Add a timeout regression test\n- [ ] Confirm retry behavior against a slow broker",
	files,
	checks
);
const pulls = [
	detail,
	buildPull(
		768,
		"feat: surface session health in the project view",
		"marco",
		"Expose current session health in the project view.",
		[{ additions: 35, deletions: 4, path: "src/desktop/projects/health.tsx" }],
		[{ bucket: "pass", name: "unit tests", state: "SUCCESS" }]
	),
	buildPull(
		761,
		"docs: clarify local provider setup",
		"sana",
		"Update the local provider setup guide.",
		[{ additions: 18, deletions: 9, path: "docs/providers/local.mdx" }],
		[{ bucket: "pass", name: "docs build", state: "SUCCESS" }]
	),
];

const calls: GitHubDataRecord[] = [];
window.__codeReviewPreviewCalls = calls;
window.ryu = {
	context: { view: "pulls" },
	app: {
		request: async ({ method, path }) => {
			calls.push({ kind: "github", method, path });
			if (path === "/status") {
				return {
					available: true,
					provider: "github",
					version: "gh 2.80.0",
					viewer: { login: "jiawei" },
				};
			}
			if (path.startsWith("/pulls?")) {
				return { pulls };
			}
			if (path.endsWith("/diff")) {
				return {
					patch:
						"diff --git a/src/main/broker/readiness.ts b/src/main/broker/readiness.ts\n@@ -1,3 +1,8 @@\n-export const readinessTimeout = 0;\n+export const readinessTimeout = 150;\n+export async function awaitReady(connect: () => Promise<void>) {\n+  return Promise.race([connect(), timeout(readinessTimeout)]);\n+}\n",
					truncated: false,
				};
			}
			const match = path.match(/\/pulls\/[^/]+\/[^/]+\/(\d+)/u);
			const selected = match
				? pulls.find((pull) => pull.number === Number(match[1]))
				: null;
			if (method === "GET" && selected) {
				return selected;
			}
			return { ok: true };
		},
	},
	model: {
		complete: async ({ prompt, system }) => {
			calls.push({ kind: "model", prompt, system });
			return [
				"Preview response — focus on these review points:",
				"",
				"- **Timeout cleanup:** confirm the timed-out socket is closed before retrying.",
				"- **Fallback behavior:** verify the direct-server path still recovers after a slow broker connection.",
				"- **Coverage:** add a regression for the timeout boundary and healthy fast path.",
			].join("\n");
		},
	},
	ui: {
		openExternal: async ({ url }) => {
			calls.push({ kind: "external", url });
		},
	},
};

subscribeCompanionTheme();
const root = document.getElementById("ryu-plugin-root");
if (root) {
	markCompanionAppRoot(root);
	createRoot(root).render(
		<StrictMode>
			<RyuAppShell>
				<App />
			</RyuAppShell>
		</StrictMode>
	);
}

declare global {
	interface Window {
		__codeReviewPreviewCalls?: GitHubDataRecord[];
	}
}
