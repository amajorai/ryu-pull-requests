import { describe, expect, test } from "bun:test";
import { GitHubDeviceAuth } from "./auth.ts";

const stream = (value: string): ReadableStream<Uint8Array> =>
	new Blob([value]).stream();

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

describe("GitHubDeviceAuth", () => {
	test("returns the device code while gh continues polling", async () => {
		const exit = deferred<number>();
		const auth = new GitHubDeviceAuth(() => ({
			exited: exit.promise,
			kill() {},
			stderr: stream(
				"! First copy your one-time code: ABCD-1234\nOpen this URL to continue: https://github.com/login/device\n"
			),
			stdout: stream(""),
		}));

		const first = await auth.start();
		expect(first).toMatchObject({
			state: "pending",
			userCode: "ABCD-1234",
			verificationUri: "https://github.com/login/device",
		});
		expect((await auth.start()).id).toBe(first.id);

		exit.resolve(0);
		await Bun.sleep(0);
		expect(auth.current()?.state).toBe("success");
	});

	test("cancels an active login without exposing process output", async () => {
		const exit = deferred<number>();
		let killed = false;
		const auth = new GitHubDeviceAuth(() => ({
			exited: exit.promise,
			kill() {
				killed = true;
			},
			stderr: stream(
				"First copy your one-time code: WXYZ-9876\nhttps://github.com/login/device\n"
			),
			stdout: stream(""),
		}));

		await auth.start();
		expect(auth.cancel()?.state).toBe("cancelled");
		expect(killed).toBeTrue();
		expect(JSON.stringify(auth.current())).not.toContain("token");
		exit.resolve(130);
	});
});
