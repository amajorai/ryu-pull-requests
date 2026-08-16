import { useCallback, useEffect, useMemo, useState } from "react";
import {
	addComment,
	addReview,
	cancelDeviceAuth,
	getDeviceAuth,
	getDiff,
	getPull,
	getStatus,
	listPulls,
	mergePull,
	setDraft,
	startDeviceAuth,
	subscribeTheme,
} from "./api.ts";
import {
	CheckIcon,
	ExternalIcon,
	FileIcon,
	MessageIcon,
	PullIcon,
	RefreshIcon,
	SearchIcon,
	XIcon,
} from "./icons.tsx";
import type {
	DeviceAuthStatus,
	ProviderStatus,
	PullDetail,
	PullSummary,
} from "./types.ts";

const timeAgo = (value: string): string => {
	const seconds = Math.max(
		1,
		Math.round((Date.now() - new Date(value).getTime()) / 1000)
	);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m`;
	}
	if (seconds < 86_400) {
		return `${Math.floor(seconds / 3600)}h`;
	}
	if (seconds < 2_592_000) {
		return `${Math.floor(seconds / 86_400)}d`;
	}
	if (seconds < 31_536_000) {
		return `${Math.floor(seconds / 2_592_000)}mo`;
	}
	return `${Math.floor(seconds / 31_536_000)}y`;
};

const errorText = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
const repoName = (pull: PullSummary): string => pull.repository.nameWithOwner;

function GitHubSetup({
	message,
	onAuthenticated,
}: {
	message: string;
	onAuthenticated(): Promise<void>;
}) {
	const [auth, setAuth] = useState<DeviceAuthStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
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
		const timer = setInterval(() => {
			void getDeviceAuth()
				.then((next) => {
					setAuth(next);
					if (next?.state === "success") {
						clearInterval(timer);
						void onAuthenticated();
					}
				})
				.catch((caught: unknown) => setLocalError(errorText(caught)));
		}, 1500);
		return () => clearInterval(timer);
	}, [auth?.state, onAuthenticated]);

	const start = async () => {
		setBusy(true);
		setLocalError(null);
		try {
			const next = await startDeviceAuth();
			setAuth(next);
			if (next.verificationUri) {
				await window.ryu?.ui?.openExternal?.({ url: next.verificationUri });
			}
		} catch (caught) {
			setLocalError(errorText(caught));
		} finally {
			setBusy(false);
		}
	};

	const cancel = async () => {
		setBusy(true);
		try {
			setAuth(await cancelDeviceAuth());
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
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
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
					<button
						aria-label="Copy one-time GitHub code"
						className="device-code"
						onClick={copyCode}
						type="button"
					>
						{auth.userCode}
						<small>{copied ? "Copied" : "Copy"}</small>
					</button>
					<div className="setup-actions">
						<button
							onClick={() =>
								window.ryu?.ui?.openExternal?.({
									url:
										auth.verificationUri ?? "https://github.com/login/device",
								})
							}
							type="button"
						>
							Open GitHub
						</button>
						<button disabled={busy} onClick={cancel} type="button">
							Cancel
						</button>
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
						<button disabled={busy} onClick={start} type="button">
							{busy ? "Starting…" : "Sign in with GitHub"}
						</button>
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

function Avatar({ actor }: { actor?: { avatarUrl?: string; login?: string } }) {
	return (
		<span
			aria-hidden="true"
			className="avatar fallback"
			title={actor?.login ?? "Unknown user"}
		>
			{actor?.login?.slice(0, 1).toUpperCase() ?? "?"}
		</span>
	);
}

function StatusDot({ pull }: { pull: PullSummary }) {
	const state = pull.isDraft ? "draft" : pull.state.toLowerCase();
	return (
		<span aria-label={state} className={`status-dot ${state}`} title={state} />
	);
}

function PullList({
	pulls,
	selected,
	onSelect,
}: {
	pulls: PullSummary[];
	selected: string | null;
	onSelect(pull: PullSummary): void;
}) {
	if (pulls.length === 0) {
		return (
			<div className="empty-list">
				<PullIcon />
				<p>No pull requests found</p>
				<span>Try another scope, state, or search.</span>
			</div>
		);
	}
	return (
		<div className="pull-list">
			{pulls.map((pull) => {
				const key = `${repoName(pull)}#${pull.number}`;
				return (
					<button
						className="pull-row"
						data-selected={selected === key}
						key={key}
						onClick={() => onSelect(pull)}
						type="button"
					>
						<div className="pull-row-icon">
							<PullIcon />
							<StatusDot pull={pull} />
						</div>
						<div className="pull-row-copy">
							<div className="pull-title">{pull.title}</div>
							<div className="pull-meta">
								{repoName(pull)} <span>#{pull.number}</span>
							</div>
						</div>
						<div className="pull-row-aside">
							<time>{timeAgo(pull.updatedAt)}</time>
							<span>
								{pull.commentsCount > 0 ? `${pull.commentsCount} comments` : ""}
							</span>
						</div>
					</button>
				);
			})}
		</div>
	);
}

function Summary({ detail }: { detail: PullDetail }) {
	const reviewers = [
		...detail.reviewRequests
			.map((item) => item.requestedReviewer)
			.filter(Boolean),
		...detail.latestReviews.map((item) => item.author).filter(Boolean),
	];
	return (
		<>
			<section className="summary-grid">
				<div>
					<span>Branch</span>
					<strong>
						{detail.baseRefName} <b>←</b> {detail.headRefName}
					</strong>
				</div>
				<div>
					<span>Reviewers</span>
					<strong>
						{reviewers.length
							? reviewers.map((item) => item?.login).join(", ")
							: "None"}
					</strong>
				</div>
				<div>
					<span>Comments</span>
					<strong>{detail.comments.length} comments</strong>
				</div>
				<div>
					<span>Checks</span>
					<strong>
						{detail.statusCheckRollup.length
							? `${detail.statusCheckRollup.length} checks`
							: "No CI checks"}
					</strong>
				</div>
				<div>
					<span>Status</span>
					<strong>
						{detail.isDraft
							? "Draft"
							: detail.reviewDecision || detail.mergeStateStatus}
					</strong>
				</div>
				<div>
					<span>Changes</span>
					<strong>
						<i className="plus">+{detail.additions}</i>{" "}
						<i className="minus">−{detail.deletions}</i>
					</strong>
				</div>
			</section>
			<section className="detail-section">
				<h2>Description</h2>
				<div className="markdown-body">
					{detail.body || (
						<span className="muted">No description provided.</span>
					)}
				</div>
			</section>
		</>
	);
}

function Code({
	detail,
	patch,
	loading,
	onLoad,
}: {
	detail: PullDetail;
	patch: { patch: string; truncated: boolean } | null;
	loading: boolean;
	onLoad(): void;
}) {
	return (
		<div className="code-view">
			<div className="file-list">
				{detail.files.map((file) => (
					<div className="file-row" key={file.path}>
						<FileIcon />
						<span>{file.path}</span>
						<i className="plus">+{file.additions}</i>
						<i className="minus">−{file.deletions}</i>
					</div>
				))}
			</div>
			{patch ? (
				<>
					<pre className="diff">
						<code>{patch.patch}</code>
					</pre>
					{patch.truncated ? (
						<p className="notice">
							Diff truncated. Open on GitHub to view the rest.
						</p>
					) : null}
				</>
			) : (
				<button
					className="load-diff"
					disabled={loading}
					onClick={onLoad}
					type="button"
				>
					{loading ? "Loading patch…" : "Load full patch"}
				</button>
			)}
		</div>
	);
}

function Activity({ detail }: { detail: PullDetail }) {
	const items = [
		...detail.latestReviews.map((review) => ({
			actor: review.author,
			body: review.body || review.state.replaceAll("_", " "),
			date: review.submittedAt,
			kind: review.state,
		})),
		...detail.comments.map((comment) => ({
			actor: comment.author,
			body: comment.body,
			date: comment.createdAt,
			kind: "comment",
		})),
	].sort((a, b) => String(a.date).localeCompare(String(b.date)));
	return (
		<section className="detail-section activity">
			<h2>
				Activity <span>{items.length}</span>
			</h2>
			{items.length === 0 ? (
				<p className="muted">No activity yet.</p>
			) : (
				items.map((item, index) => (
					<article className="activity-card" key={`${item.date}-${index}`}>
						<Avatar actor={item.actor} />
						<div>
							<header>
								<strong>{item.actor?.login ?? "Unknown"}</strong>
								<span>{item.date ? timeAgo(item.date) : ""}</span>
							</header>
							<p>{item.body}</p>
						</div>
					</article>
				))
			)}
		</section>
	);
}

function Checks({ detail }: { detail: PullDetail }) {
	return (
		<section className="detail-section">
			<h2>Checks</h2>
			{detail.statusCheckRollup.length === 0 ? (
				<p className="muted center">No CI checks</p>
			) : (
				detail.statusCheckRollup.map((check, index) => {
					const passing =
						check.bucket === "pass" ||
						check.conclusion === "SUCCESS" ||
						check.state === "SUCCESS";
					const failing =
						check.bucket === "fail" ||
						check.conclusion === "FAILURE" ||
						check.state === "FAILURE";
					return (
						<div className="check-row" key={`${check.name}-${index}`}>
							{passing ? (
								<CheckIcon className="good" />
							) : failing ? (
								<XIcon className="bad" />
							) : (
								<span className="pending-dot" />
							)}
							<span>{check.name ?? check.workflowName ?? "Check"}</span>
							<small>{check.bucket ?? check.state ?? check.status}</small>
						</div>
					);
				})
			)}
		</section>
	);
}

function Composer({
	detail,
	onDone,
}: {
	detail: PullDetail;
	onDone(): Promise<void>;
}) {
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	const [mode, setMode] = useState<"comment" | "approve" | "request_changes">(
		"comment"
	);
	const submit = async () => {
		if (!body.trim() && mode !== "approve") {
			return;
		}
		setBusy(true);
		try {
			if (mode === "comment") {
				await addComment(repoName(detail), detail.number, body);
			} else {
				await addReview(repoName(detail), detail.number, mode, body);
			}
			setBody("");
			await onDone();
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="composer">
			<textarea
				aria-label="Review comment"
				onChange={(event) => setBody(event.target.value)}
				placeholder={
					mode === "approve" ? "Optional approval note" : "Leave a comment"
				}
				value={body}
			/>
			<footer>
				<select
					aria-label="Comment type"
					onChange={(event) => setMode(event.target.value as typeof mode)}
					value={mode}
				>
					<option value="comment">Comment</option>
					<option value="approve">Approve</option>
					<option value="request_changes">Request changes</option>
				</select>
				<button
					disabled={busy || (!body.trim() && mode !== "approve")}
					onClick={submit}
					type="button"
				>
					{busy ? (
						"Sending…"
					) : (
						<>
							<MessageIcon /> Send
						</>
					)}
				</button>
			</footer>
		</div>
	);
}

function DetailPane({
	pull,
	onMutated,
}: {
	pull: PullSummary | null;
	onMutated(): Promise<void>;
}) {
	const [detail, setDetail] = useState<PullDetail | null>(null);
	const [tab, setTab] = useState<"summary" | "code">("summary");
	const [patch, setPatch] = useState<{
		patch: string;
		truncated: boolean;
	} | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mergeOpen, setMergeOpen] = useState(false);
	const load = useCallback(async () => {
		if (!pull) {
			return;
		}
		setLoading(true);
		setError(null);
		setPatch(null);
		try {
			setDetail(await getPull(repoName(pull), pull.number));
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setLoading(false);
		}
	}, [pull]);
	useEffect(() => {
		setTab("summary");
		setDetail(null);
		void load();
	}, [load]);
	if (!pull) {
		return (
			<div className="detail-empty">
				<PullIcon />
				<h2>Select a pull request</h2>
				<p>Its summary, changes, checks, and discussion will appear here.</p>
			</div>
		);
	}
	if (loading && !detail) {
		return (
			<div className="detail-empty">
				<span className="spinner" />
				<p>Loading pull request…</p>
			</div>
		);
	}
	if (error || !detail) {
		return (
			<div className="detail-empty error">
				<h2>Couldn’t load this pull request</h2>
				<p>{error}</p>
				<button onClick={load} type="button">
					Try again
				</button>
			</div>
		);
	}
	const mutate = async (action: () => Promise<unknown>) => {
		setLoading(true);
		try {
			await action();
			await load();
			await onMutated();
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setLoading(false);
		}
	};
	const openExternal = () =>
		window.ryu?.ui?.openExternal?.({ url: detail.url });
	return (
		<div className="detail-pane">
			<header className="detail-toolbar">
				<nav>
					<button
						aria-selected={tab === "summary"}
						onClick={() => setTab("summary")}
						type="button"
					>
						Summary
					</button>
					<button
						aria-selected={tab === "code"}
						onClick={() => setTab("code")}
						type="button"
					>
						Code <span>{detail.changedFiles}</span>
					</button>
				</nav>
				<div>
					<button
						aria-label="Open on GitHub"
						className="icon-button"
						onClick={openExternal}
						title="Open on GitHub"
						type="button"
					>
						<ExternalIcon />
					</button>
					{detail.isDraft ? (
						<button
							className="secondary"
							disabled={loading}
							onClick={() =>
								mutate(() => setDraft(repoName(detail), detail.number, false))
							}
							type="button"
						>
							Ready for review
						</button>
					) : null}
					<button
						className="merge-button"
						disabled={loading || detail.state !== "OPEN"}
						onClick={() => setMergeOpen((value) => !value)}
						type="button"
					>
						<PullIcon /> Merge
					</button>
					{mergeOpen ? (
						<div className="merge-menu">
							<button
								onClick={() =>
									mutate(() =>
										mergePull(repoName(detail), detail.number, "merge", false)
									)
								}
								type="button"
							>
								Create merge commit
							</button>
							<button
								onClick={() =>
									mutate(() =>
										mergePull(repoName(detail), detail.number, "squash", false)
									)
								}
								type="button"
							>
								Squash and merge
							</button>
							<button
								onClick={() =>
									mutate(() =>
										mergePull(repoName(detail), detail.number, "rebase", false)
									)
								}
								type="button"
							>
								Rebase and merge
							</button>
							<button
								onClick={() =>
									mutate(() =>
										mergePull(repoName(detail), detail.number, "squash", true)
									)
								}
								type="button"
							>
								Auto-merge when ready
							</button>
						</div>
					) : null}
				</div>
			</header>
			<div className="detail-scroll">
				<div className="detail-heading">
					<StatusDot pull={detail} />
					<div>
						<h1>{detail.title}</h1>
						<p>
							<Avatar actor={detail.author} />
							<strong>{detail.author?.login ?? "Unknown"}</strong>
							<span>
								opened #{detail.number} {timeAgo(detail.createdAt)} ago in{" "}
								{repoName(detail)}
							</span>
						</p>
					</div>
				</div>
				{tab === "summary" ? (
					<>
						<Summary detail={detail} />
						<Checks detail={detail} />
						<Activity detail={detail} />
						<Composer detail={detail} onDone={load} />
					</>
				) : (
					<Code
						detail={detail}
						loading={loading}
						onLoad={() => {
							setLoading(true);
							getDiff(repoName(detail), detail.number)
								.then(setPatch)
								.catch((caught) => setError(errorText(caught)))
								.finally(() => setLoading(false));
						}}
						patch={patch}
					/>
				)}
			</div>
		</div>
	);
}

export function App() {
	const [scope, setScope] = useState("all");
	const [state, setState] = useState("open");
	const [query, setQuery] = useState("");
	const [pulls, setPulls] = useState<PullSummary[]>([]);
	const [selected, setSelected] = useState<PullSummary | null>(null);
	const [status, setStatus] = useState<ProviderStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const selectedKey = selected
		? `${repoName(selected)}#${selected.number}`
		: null;
	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		setStatus(null);
		try {
			const nextStatus = await getStatus();
			setStatus(nextStatus);
			const nextPulls = await listPulls({ query, scope, state });
			setPulls(nextPulls);
			setSelected(
				(current) =>
					(current &&
						nextPulls.find(
							(pull) =>
								repoName(pull) === repoName(current) &&
								pull.number === current.number
						)) ||
					nextPulls[0] ||
					null
			);
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setLoading(false);
		}
	}, [query, scope, state]);
	useEffect(() => subscribeTheme(), []);
	useEffect(() => {
		const timer = setTimeout(() => void load(), 180);
		return () => clearTimeout(timer);
	}, [load]);
	const subtitle = useMemo(
		() =>
			status?.viewer?.login ? `GitHub · @${status.viewer.login}` : "GitHub CLI",
		[status]
	);
	return (
		<main className="app-shell">
			<section className={`inbox ${selected ? "has-selection" : ""}`}>
				<header className="inbox-header">
					<div className="scope-tabs">
						<button
							aria-selected={scope === "all"}
							onClick={() => setScope("all")}
							type="button"
						>
							All
						</button>
						<button
							aria-selected={scope === "reviewing"}
							onClick={() => setScope("reviewing")}
							type="button"
						>
							Reviewing
						</button>
						<button
							aria-selected={scope === "authored"}
							onClick={() => setScope("authored")}
							type="button"
						>
							Authored
						</button>
					</div>
					<span>{subtitle}</span>
				</header>
				<div className="search-row">
					<label>
						<SearchIcon />
						<input
							aria-label="Search pull requests"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search pull requests"
							value={query}
						/>
					</label>
					<button
						aria-label="Refresh"
						className="icon-button"
						disabled={loading}
						onClick={load}
						title="Refresh"
						type="button"
					>
						<RefreshIcon />
					</button>
				</div>
				<div className="filters">
					<select
						aria-label="Pull request state"
						onChange={(event) => setState(event.target.value)}
						value={state}
					>
						<option value="open">Open</option>
						<option value="merged">Merged</option>
						<option value="closed">Closed</option>
					</select>
					<span>
						{loading ? "Refreshing…" : `${pulls.length} pull requests`}
					</span>
				</div>
				{error ? (
					status ? (
						<div className="setup-error">
							<h2>Couldn’t load pull requests</h2>
							<p>{error}</p>
							<button onClick={load} type="button">
								Try again
							</button>
						</div>
					) : (
						<GitHubSetup message={error} onAuthenticated={load} />
					)
				) : (
					<PullList
						onSelect={setSelected}
						pulls={pulls}
						selected={selectedKey}
					/>
				)}
			</section>
			<section className={`detail ${selected ? "visible" : ""}`}>
				<button
					className="mobile-back"
					onClick={() => setSelected(null)}
					type="button"
				>
					← Pull requests
				</button>
				<DetailPane onMutated={load} pull={selected} />
			</section>
		</main>
	);
}
