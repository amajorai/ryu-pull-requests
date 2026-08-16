const DEVICE_AUTH_LIFETIME_MS = 15 * 60 * 1000;
const DEVICE_AUTH_START_TIMEOUT_MS = 20_000;
const MAX_AUTH_OUTPUT_LENGTH = 16_384;
const DEVICE_CODE_PATTERN = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/;
const DEVICE_URL_PATTERN = /https:\/\/github\.com\/login\/device\b/;
const ANSI_PATTERN = new RegExp(
	`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
	"g"
);

export type DeviceAuthState =
	| "starting"
	| "pending"
	| "success"
	| "error"
	| "cancelled";

export interface DeviceAuthStatus {
	expiresAt: string;
	id: string;
	message?: string;
	startedAt: string;
	state: DeviceAuthState;
	userCode?: string;
	verificationUri?: string;
}

interface DeviceAuthProcess {
	exited: Promise<number>;
	kill(): void;
	stderr: ReadableStream<Uint8Array>;
	stdout: ReadableStream<Uint8Array>;
}

type SpawnDeviceAuth = () => DeviceAuthProcess;

const spawnDeviceAuth: SpawnDeviceAuth = () =>
	Bun.spawn(
		[
			"gh",
			"auth",
			"login",
			"--hostname",
			"github.com",
			"--git-protocol",
			"https",
			"--skip-ssh-key",
			"--web",
		],
		{
			env: {
				...Bun.env,
				GH_BROWSER: "echo",
				GH_PROMPT_DISABLED: undefined,
				GH_TOKEN: undefined,
				GITHUB_TOKEN: undefined,
				NO_COLOR: "1",
			},
			stdin: "ignore",
			stderr: "pipe",
			stdout: "pipe",
		}
	);

const cleanOutput = (value: string): string =>
	value.replace(ANSI_PATTERN, "").replaceAll("\r", "").trim();

const publicStatus = (status: DeviceAuthStatus): DeviceAuthStatus => ({
	...status,
});

export class GitHubDeviceAuth {
	private activeProcess: DeviceAuthProcess | null = null;
	private output = "";
	private status: DeviceAuthStatus | null = null;

	constructor(private readonly spawn: SpawnDeviceAuth = spawnDeviceAuth) {}

	current(): DeviceAuthStatus | null {
		return this.status ? publicStatus(this.status) : null;
	}

	async start(): Promise<DeviceAuthStatus> {
		if (
			this.status &&
			(this.status.state === "starting" || this.status.state === "pending")
		) {
			return publicStatus(this.status);
		}

		const startedAt = new Date();
		this.status = {
			expiresAt: new Date(
				startedAt.getTime() + DEVICE_AUTH_LIFETIME_MS
			).toISOString(),
			id: crypto.randomUUID(),
			startedAt: startedAt.toISOString(),
			state: "starting",
		};
		this.output = "";

		let process: DeviceAuthProcess;
		try {
			process = this.spawn();
			this.activeProcess = process;
		} catch (error) {
			this.fail(error instanceof Error ? error.message : "Could not start gh");
			return publicStatus(this.status);
		}

		return await new Promise<DeviceAuthStatus>((resolve) => {
			let settled = false;
			const settle = () => {
				if (settled || !this.status) {
					return;
				}
				settled = true;
				if (this.status.state !== "starting") {
					clearTimeout(startTimeout);
				}
				resolve(publicStatus(this.status));
			};
			const startTimeout = setTimeout(() => {
				if (
					this.activeProcess !== process ||
					this.status?.state !== "starting"
				) {
					return;
				}
				process.kill();
				this.fail("GitHub CLI did not produce a device code in time.");
				settle();
			}, DEVICE_AUTH_START_TIMEOUT_MS);

			const read = async (stream: ReadableStream<Uint8Array>) => {
				const reader = stream.getReader();
				const decoder = new TextDecoder();
				try {
					while (true) {
						const chunk = await reader.read();
						if (chunk.done) {
							break;
						}
						this.consume(decoder.decode(chunk.value, { stream: true }));
						if (this.status?.state === "pending") {
							settle();
						}
					}
					this.consume(decoder.decode());
				} finally {
					reader.releaseLock();
				}
			};

			void (async () => {
				const [, , exitCode] = await Promise.all([
					read(process.stdout),
					read(process.stderr),
					process.exited,
				]);
				clearTimeout(startTimeout);
				if (this.activeProcess !== process) {
					settle();
					return;
				}
				this.activeProcess = null;
				if (this.status?.state === "cancelled") {
					settle();
					return;
				}
				if (exitCode === 0) {
					this.update({ state: "success" });
				} else {
					const message = cleanOutput(this.output)
						.split("\n")
						.filter((line) => !DEVICE_CODE_PATTERN.test(line))
						.at(-1);
					this.fail(message || `GitHub CLI exited with status ${exitCode}.`);
				}
				settle();
			})().catch((error: unknown) => {
				clearTimeout(startTimeout);
				if (this.activeProcess === process) {
					this.activeProcess = null;
					this.fail(
						error instanceof Error ? error.message : "GitHub sign-in failed."
					);
				}
				settle();
			});
		});
	}

	cancel(): DeviceAuthStatus | null {
		if (
			this.activeProcess &&
			(this.status?.state === "starting" || this.status?.state === "pending")
		) {
			this.status = { ...this.status, state: "cancelled" };
			const process = this.activeProcess;
			this.activeProcess = null;
			process.kill();
		}
		return this.current();
	}

	private consume(chunk: string): void {
		if (!(chunk && this.status)) {
			return;
		}
		this.output = `${this.output}${chunk}`.slice(-MAX_AUTH_OUTPUT_LENGTH);
		if (this.status.state !== "starting") {
			return;
		}
		const clean = cleanOutput(this.output);
		const userCode = clean.match(DEVICE_CODE_PATTERN)?.[0];
		const verificationUri = clean.match(DEVICE_URL_PATTERN)?.[0];
		if (userCode && verificationUri) {
			this.update({ state: "pending", userCode, verificationUri });
		}
	}

	private fail(message: string): void {
		this.update({ message, state: "error" });
	}

	private update(change: Partial<DeviceAuthStatus>): void {
		if (this.status) {
			this.status = { ...this.status, ...change };
		}
	}
}
