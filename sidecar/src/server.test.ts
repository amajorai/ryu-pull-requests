import { afterEach, describe, expect, test } from "bun:test";
import { GitHubProvider } from "./github.ts";
import { createServer } from "./server.ts";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) {
		server.stop(true);
	}
});

function runtime(token: string) {
	const calls: string[][] = [];
	// A tripwire, never a provider response: these requests must not reach gh.
	const provider = new GitHubProvider({
		async run(args) {
			calls.push(args);
			throw new Error("Unexpected GitHub CLI dispatch");
		},
	});
	const server = createServer({ port: 0, provider, token });
	servers.push(server);
	return { calls, base: `http://127.0.0.1:${server.port}` };
}

describe("Pull Requests local HTTP boundary", () => {
	test("health stays open while absent and incorrect credentials fail closed", async () => {
		const { base, calls } = runtime("test-token");
		const health = await fetch(`${base}/health`);
		expect(health.status).toBe(200);
		expect(await health.json()).toEqual({ ok: true, provider: "github" });
		for (const authorization of [undefined, "Bearer wrong", "test-token"]) {
			const response = await fetch(`${base}/api/pull-requests/status`, {
				headers: authorization ? { authorization } : {},
			});
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: "unauthorized" });
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
		expect(calls).toEqual([]);
	});

	test("an empty process token rejects even a syntactically matching bearer", async () => {
		const { base, calls } = runtime("");
		const response = await fetch(`${base}/api/pull-requests/pulls`, {
			headers: { authorization: "Bearer " },
		});
		expect(response.status).toBe(401);
		expect(calls).toEqual([]);
	});

	test("invalid mutation payloads cannot dispatch, and the next request still works", async () => {
		const { base, calls } = runtime("test-token");
		for (const [body, error] of [
			[{ strategy: "delete" }, "invalid merge strategy"],
			[[], "request body must be an object"],
			[{ strategy: "squash", mergeAction: "force" }, "invalid merge action"],
		] as const) {
			const response = await fetch(
				`${base}/api/pull-requests/pulls/acme/repo/1/merge`,
				{
					method: "POST",
					headers: {
						authorization: "Bearer test-token",
						"content-type": "application/json",
					},
					body: JSON.stringify(body),
				}
			);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error });
		}
		const readback = await fetch(`${base}/api/pull-requests/auth/device`, {
			headers: { authorization: "Bearer test-token" },
		});
		expect(readback.status).toBe(200);
		expect(await readback.json()).toEqual({ auth: null });
		expect(calls).toEqual([]);
	});

	test("wrong methods and unknown routes return exact errors without dispatch", async () => {
		const { base, calls } = runtime("test-token");
		for (const [path, method, status, error] of [
			["auth/device", "PUT", 405, "method not allowed"],
			["unknown", "GET", 404, "not found"],
			["pulls/acme/repo/1/comment", "DELETE", 405, "method not allowed"],
		] as const) {
			const response = await fetch(`${base}/api/pull-requests/${path}`, {
				method,
				headers: { authorization: "Bearer test-token" },
			});
			expect(response.status).toBe(status);
			expect(await response.json()).toEqual({ error });
		}
		expect(calls).toEqual([]);
	});
});
