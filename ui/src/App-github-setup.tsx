import { Button, Input } from "@ryu/blocks/companion/controls";
import {
	isViewVisible,
	subscribeViewVisibility,
} from "@ryu/ui/lib/view-visibility.ts";
import { useEffect, useState } from "react";
import { errorText } from "./App-format.ts";
import { cancelDeviceAuth, getDeviceAuth, startDeviceAuth } from "./api.ts";
import type { DeviceAuthStatus } from "./types.ts";

export function GitHubSetup({
	message,
	onAuthenticated,
}: {
	message: string;
	onAuthenticated(): Promise<void>;
}) {
	const [auth, setAuth] = useState<DeviceAuthStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [manualCopyAvailable, setManualCopyAvailable] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);

	useEffect(() => {
		void getDeviceAuth()
			.then(setAuth)
			.catch(() => undefined);
	}, []);

	useEffect(() => {
		if (auth?.state !== "pending" && auth?.state !== "starting") {
			return;
		}
		let disposed = false;
		let pending = false;
		const poll = () => {
			if (disposed || pending || !isViewVisible()) {
				return;
			}
			pending = true;
			void getDeviceAuth()
				.then((next) => {
					if (disposed) {
						return;
					}
					setAuth(next);
					if (next?.state === "success") {
						disposed = true;
						clearInterval(timer);
						unsubscribe();
						void onAuthenticated();
					}
				})
				.catch((cause: unknown) => {
					if (!disposed) {
						setLocalError(errorText(cause));
					}
				})
				.finally(() => {
					pending = false;
				});
		};
		const unsubscribe = subscribeViewVisibility(poll);
		const timer = setInterval(poll, 1500);
		return () => {
			disposed = true;
			unsubscribe();
			clearInterval(timer);
		};
	}, [auth?.state, onAuthenticated]);

	const start = async () => {
		setBusy(true);
		setLocalError(null);
		setManualCopyAvailable(false);
		try {
			const next = await startDeviceAuth();
			setAuth(next);
			if (next.verificationUri) {
				await window.ryu?.ui?.openExternal?.({ url: next.verificationUri });
			}
		} catch (cause) {
			setLocalError(errorText(cause));
		} finally {
			setBusy(false);
		}
	};

	const cancel = async () => {
		setBusy(true);
		setLocalError(null);
		try {
			setAuth(await cancelDeviceAuth());
		} catch (cause) {
			setLocalError(errorText(cause));
		} finally {
			setBusy(false);
		}
	};

	const copyCode = async () => {
		if (!auth?.userCode) {
			return;
		}
		try {
			await navigator.clipboard.writeText(auth.userCode);
			setManualCopyAvailable(false);
			setLocalError(null);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			setManualCopyAvailable(true);
			setLocalError("Select the code and copy it manually.");
		}
	};

	const waiting = auth?.state === "starting" || auth?.state === "pending";
	return (
		<div className="setup-error">
			<h2>Connect GitHub</h2>
			{auth?.state === "pending" && auth.userCode ? (
				<>
					<p>Enter this one-time code in the GitHub page that opened:</p>
					<Button
						aria-label="Copy one-time GitHub code"
						className="device-code"
						onClick={copyCode}
						type="button"
					>
						{auth.userCode}
						<small>{copied ? "Copied" : "Copy"}</small>
					</Button>
					{manualCopyAvailable ? (
						<Input
							aria-label="One-time GitHub code"
							autoFocus
							className="device-code"
							onFocus={(event) => event.currentTarget.select()}
							readOnly
							value={auth.userCode}
						/>
					) : null}
					<div className="setup-actions">
						<Button
							onClick={() =>
								window.ryu?.ui?.openExternal?.({
									url:
										auth.verificationUri ?? "https://github.com/login/device",
								})
							}
							type="button"
						>
							Open GitHub
						</Button>
						<Button disabled={busy} onClick={cancel} type="button">
							Cancel
						</Button>
					</div>
					<span className="auth-waiting">
						<span className="spinner" /> Waiting for authorization…
					</span>
				</>
			) : (
				<>
					<p>
						Sign in through GitHub in your browser. Ryu never receives or stores
						your token; the GitHub CLI manages it locally.
					</p>
					{auth?.state === "starting" ? (
						<span className="auth-waiting">
							<span className="spinner" /> Starting GitHub sign-in…
						</span>
					) : (
						<Button disabled={busy} onClick={start} type="button">
							{busy ? "Starting…" : "Sign in with GitHub"}
						</Button>
					)}
				</>
			)}
			{auth?.state === "error" || auth?.state === "cancelled" ? (
				<p className="auth-error">
					{auth.message ??
						(auth.state === "cancelled" ? "Sign-in cancelled." : message)}
				</p>
			) : null}
			{localError ? <p className="auth-error">{localError}</p> : null}
			{!waiting && auth?.state !== "error" && auth?.state !== "cancelled" ? (
				<small className="setup-detail">{message}</small>
			) : null}
		</div>
	);
}
