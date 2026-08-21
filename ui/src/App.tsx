import { useCallback, useEffect, useMemo, useState } from "react";
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
	subscribeTheme,
	unstack,
} from "./api.ts";
import {
	CheckIcon,
	ExternalIcon,
	FileIcon,
	IssueClosedIcon,
	IssueIcon,
	MessageIcon,
	PullClosedIcon,
	PullDraftIcon,
	PullIcon,
	PullMergedIcon,
	RefreshIcon,
	SearchIcon,
	XIcon,
} from "./icons.tsx";
import {
	type PullRequestStatus,
	pullRequestStatus,
	pullRequestStatusLabel,
} from "./status.ts";
import { type PullTask, parsePullTasks } from "./tasks.ts";
import type {
	DeviceAuthStatus,
	IssueDetail,
	IssueSummary,
	ProviderStatus,
	PullDetail,
	PullStackEntry,
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
const issueRepoName = (issue: IssueSummary): string =>
	issue.repository.nameWithOwner;
const wait = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseStackInput(value: string): number[] {
	return value
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((item) => Number(item));
}

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
		setLocalError(null);
		try {
			setAuth(await cancelDeviceAuth());
		} catch (caught) {
			setLocalError(errorText(caught));
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

function IssueLabels({ labels }: { labels: IssueDetail["labels"] }) {
	if (labels.length === 0) {
		return <span className="muted">None</span>;
	}
	return (
		<span className="label-list">
			{labels.map((label) => (
				<span className="issue-label" key={label.name}>
					{label.name}
				</span>
			))}
		</span>
	);
}

function IssueList({
	issues,
	selected,
	onSelect,
}: {
	issues: IssueSummary[];
	selected: string | null;
	onSelect(issue: IssueSummary): void;
}) {
	if (issues.length === 0) {
		return (
			<div className="empty-list">
				<IssueIcon />
				<p>No issues found</p>
				<span>Try another scope, state, or search.</span>
			</div>
		);
	}
	return (
		<div className="pull-list issue-list">
			{issues.map((issue) => {
				const key = `${issueRepoName(issue)}#${issue.number}`;
				return (
					<button
						className="pull-row issue-row"
						data-selected={selected === key}
						key={key}
						onClick={() => onSelect(issue)}
						type="button"
					>
						<IssueStatusIcon issue={issue} />
						<div className="pull-row-copy">
							<div className="pull-title">{issue.title}</div>
							<div className="pull-meta">
								{issueRepoName(issue)} <span>#{issue.number}</span>
							</div>
						</div>
						<div className="pull-row-aside">
							<time>{timeAgo(issue.updatedAt)}</time>
							<span>
								{issue.commentsCount > 0
									? `${issue.commentsCount} comments`
									: ""}
							</span>
						</div>
					</button>
				);
			})}
		</div>
	);
}

function IssueSummaryPanel({ detail }: { detail: IssueDetail }) {
	return (
		<>
			<section className="summary-grid issue-summary-grid">
				<div>
					<span>Assignees</span>
					<strong>
						{detail.assignees.length
							? detail.assignees.map((assignee) => assignee.login).join(", ")
							: "None"}
					</strong>
				</div>
				<div>
					<span>Labels</span>
					<strong>
						<IssueLabels labels={detail.labels} />
					</strong>
				</div>
				<div>
					<span>Comments</span>
					<strong>{detail.comments.length} comments</strong>
				</div>
				<div>
					<span>Status</span>
					<strong>
						{detail.state.toLowerCase() === "closed" ? "Closed" : "Open"}
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

function IssueActivity({ detail }: { detail: IssueDetail }) {
	const items = [...detail.comments].sort((a, b) =>
		String(a.createdAt).localeCompare(String(b.createdAt))
	);
	return (
		<section className="detail-section activity">
			<h2>
				Activity <span>{items.length}</span>
			</h2>
			{items.length === 0 ? (
				<p className="muted">No activity yet.</p>
			) : (
				items.map((item, index) => (
					<article className="activity-card" key={`${item.createdAt}-${index}`}>
						<Avatar actor={item.author} />
						<div>
							<header>
								<strong>{item.author?.login ?? "Unknown"}</strong>
								<span>{timeAgo(item.createdAt)}</span>
							</header>
							<p>{item.body}</p>
						</div>
					</article>
				))
			)}
		</section>
	);
}

function IssueComposer({
	detail,
	onDone,
}: {
	detail: IssueDetail;
	onDone(): Promise<void>;
}) {
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const submit = async () => {
		if (!body.trim()) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await addIssueComment(issueRepoName(detail), detail.number, body);
			setBody("");
			await onDone();
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="composer">
			<textarea
				aria-label="Issue comment"
				onChange={(event) => setBody(event.target.value)}
				placeholder="Leave a comment"
				value={body}
			/>
			{error ? (
				<p className="composer-error" role="alert">
					{error}
				</p>
			) : null}
			<footer>
				<span className="muted">Comment on GitHub</span>
				<button
					disabled={busy || !body.trim()}
					onClick={() => void submit()}
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

function IssueDetailPane({
	issue,
	onMutated,
}: {
	issue: IssueSummary | null;
	onMutated(): Promise<void>;
}) {
	const [detail, setDetail] = useState<IssueDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const load = useCallback(async () => {
		if (!issue) {
			return;
		}
		setLoading(true);
		setError(null);
		try {
			setDetail(await getIssue(issueRepoName(issue), issue.number));
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setLoading(false);
		}
	}, [issue]);
	useEffect(() => {
		setDetail(null);
		setNotice(null);
		void load();
	}, [load]);
	if (!issue) {
		return (
			<div className="detail-empty">
				<IssueIcon />
				<h2>Select an issue</h2>
				<p>
					Its description, labels, activity, and discussion will appear here.
				</p>
			</div>
		);
	}
	if (loading && !detail) {
		return (
			<div className="detail-empty">
				<span className="spinner" />
				<p>Loading issue…</p>
			</div>
		);
	}
	if (error || !detail) {
		return (
			<div className="detail-empty error">
				<h2>Couldn’t load this issue</h2>
				<p>{error}</p>
				<button onClick={load} type="button">
					Try again
				</button>
			</div>
		);
	}
	const closed = detail.state.toLowerCase() === "closed";
	const mutate = async (action: () => Promise<unknown>) => {
		setLoading(true);
		setError(null);
		try {
			await action();
			await load();
			await onMutated();
			setNotice(closed ? "Issue reopened." : "Issue closed.");
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setLoading(false);
		}
	};
	const refreshDiscussion = async () => {
		await load();
		await onMutated();
	};
	return (
		<div className="detail-pane">
			<header className="detail-toolbar">
				<nav>
					<button aria-selected type="button">
						Summary
					</button>
				</nav>
				<div>
					<button
						aria-label="Open on GitHub"
						className="icon-button"
						onClick={() => window.ryu?.ui?.openExternal?.({ url: detail.url })}
						title="Open on GitHub"
						type="button"
					>
						<ExternalIcon />
					</button>
					<button
						className="secondary"
						disabled={loading}
						onClick={() =>
							void mutate(() =>
								setIssueState(
									issueRepoName(detail),
									detail.number,
									closed ? "open" : "closed"
								)
							)
						}
						type="button"
					>
						{closed ? "Reopen issue" : "Close issue"}
					</button>
				</div>
			</header>
			{notice ? (
				<p aria-live="polite" className="merge-notice" role="status">
					{notice}
				</p>
			) : null}
			<div className="detail-scroll">
				<div className="detail-heading">
					<IssueStatusIcon issue={detail} />
					<div>
						<h1>{detail.title}</h1>
						<p>
							<Avatar actor={detail.author} />
							<strong>{detail.author?.login ?? "Unknown"}</strong>
							<span>
								opened #{detail.number} {timeAgo(detail.createdAt)} ago in{" "}
								{issueRepoName(detail)}
							</span>
						</p>
					</div>
				</div>
				<IssueSummaryPanel detail={detail} />
				<IssueActivity detail={detail} />
				<IssueComposer detail={detail} onDone={refreshDiscussion} />
			</div>
		</div>
	);
}

function IssueInbox({ onViewChange }: { onViewChange(view: AppView): void }) {
	const [scope, setScope] = useState("all");
	const [state, setState] = useState("open");
	const [query, setQuery] = useState("");
	const [issues, setIssues] = useState<IssueSummary[]>([]);
	const [selected, setSelected] = useState<IssueSummary | null>(null);
	const [status, setStatus] = useState<ProviderStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const selectedKey = selected
		? `${issueRepoName(selected)}#${selected.number}`
		: null;
	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		setStatus(null);
		try {
			const nextStatus = await getStatus();
			setStatus(nextStatus);
			const nextIssues = await listIssues({ query, scope, state });
			setIssues(nextIssues);
			setSelected(
				(current) =>
					(current &&
						nextIssues.find(
							(issue) =>
								issueRepoName(issue) === issueRepoName(current) &&
								issue.number === current.number
						)) ||
					nextIssues[0] ||
					null
			);
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setLoading(false);
		}
	}, [query, scope, state]);
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
		<>
			<section className={`inbox ${selected ? "has-selection" : ""}`}>
				<header className="inbox-header">
					<div className="inbox-topline">
						<WorkspaceTabs active="issues" onChange={onViewChange} />
						<span>{subtitle}</span>
					</div>
					<div className="scope-tabs">
						<button
							aria-selected={scope === "all"}
							onClick={() => setScope("all")}
							type="button"
						>
							All
						</button>
						<button
							aria-selected={scope === "assigned"}
							onClick={() => setScope("assigned")}
							type="button"
						>
							Assigned
						</button>
						<button
							aria-selected={scope === "authored"}
							onClick={() => setScope("authored")}
							type="button"
						>
							Authored
						</button>
					</div>
				</header>
				<div className="search-row">
					<label>
						<SearchIcon />
						<input
							aria-label="Search issues"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search issues"
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
						aria-label="Issue state"
						onChange={(event) => setState(event.target.value)}
						value={state}
					>
						<option value="open">Open</option>
						<option value="closed">Closed</option>
					</select>
					<span>{loading ? "Refreshing…" : `${issues.length} issues`}</span>
				</div>
				{error ? (
					status ? (
						<div className="setup-error">
							<h2>Couldn’t load issues</h2>
							<p>{error}</p>
							<button onClick={load} type="button">
								Try again
							</button>
						</div>
					) : (
						<GitHubSetup message={error} onAuthenticated={load} />
					)
				) : (
					<IssueList
						issues={issues}
						onSelect={setSelected}
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
					← Issues
				</button>
				<IssueDetailPane issue={selected} onMutated={load} />
			</section>
		</>
	);
}

type AppView = "issues" | "pulls";

function WorkspaceTabs({
	active,
	onChange,
}: {
	active: AppView;
	onChange(view: AppView): void;
}) {
	return (
		<nav aria-label="GitHub work items" className="workspace-tabs">
			<button
				aria-selected={active === "pulls"}
				onClick={() => onChange("pulls")}
				role="tab"
				type="button"
			>
				Pull requests
			</button>
			<button
				aria-selected={active === "issues"}
				onClick={() => onChange("issues")}
				role="tab"
				type="button"
			>
				Issues
			</button>
		</nav>
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

function PullRequestStatusIcon({ pull }: { pull: PullSummary }) {
	const status = pullRequestStatus(pull);
	const label = pullRequestStatusLabel(status);
	const Icon = statusIcon(status);
	return (
		<span
			aria-label={label}
			className={`pull-status-icon ${status}`}
			role="img"
			title={label}
		>
			<Icon />
			<span aria-hidden="true" className={`status-dot ${status}`} />
		</span>
	);
}

function IssueStatusIcon({ issue }: { issue: IssueSummary }) {
	const closed = issue.state.toLowerCase() === "closed";
	const label = closed ? "Closed issue" : "Open issue";
	const Icon = closed ? IssueClosedIcon : IssueIcon;
	return (
		<span
			aria-label={label}
			className={`issue-status-icon ${closed ? "closed" : "open"}`}
			role="img"
			title={label}
		>
			<Icon />
		</span>
	);
}

function statusIcon(status: PullRequestStatus) {
	if (status === "merged") {
		return PullMergedIcon;
	}
	if (status === "closed") {
		return PullClosedIcon;
	}
	if (status === "draft") {
		return PullDraftIcon;
	}
	return PullIcon;
}

type StackDialogMode = "add" | "create" | "unstack";

function StackDialog({
	currentNumber,
	mode,
	onClose,
	onSubmit,
	stackNumber,
}: {
	currentNumber: number;
	mode: StackDialogMode;
	onClose(): void;
	onSubmit(numbers: number[]): Promise<boolean>;
	stackNumber?: number;
}) {
	const [value, setValue] = useState(
		mode === "create" ? String(currentNumber) : ""
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isUnstack = mode === "unstack";
	const title =
		mode === "create"
			? "Create a stack"
			: mode === "add"
				? "Add layers"
				: "Unstack pull requests";
	const submit = async () => {
		const numbers = isUnstack ? [] : parseStackInput(value);
		const minimum = mode === "create" ? 2 : 1;
		if (
			!isUnstack &&
			(numbers.length < minimum ||
				numbers.some((number) => !Number.isSafeInteger(number) || number < 1) ||
				new Set(numbers).size !== numbers.length)
		) {
			setError(
				mode === "create"
					? "Enter at least two unique PR numbers, ordered from bottom to top."
					: "Enter one or more unique PR numbers to append."
			);
			return;
		}
		setBusy(true);
		setError(null);
		try {
			if (await onSubmit(numbers)) {
				onClose();
			}
		} catch (caught) {
			setError(errorText(caught));
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="stack-dialog-backdrop" onMouseDown={onClose}>
			<section
				aria-labelledby="stack-dialog-title"
				aria-modal="true"
				className="stack-dialog"
				onMouseDown={(event) => event.stopPropagation()}
				role="dialog"
			>
				<header>
					<div>
						<span className="eyebrow">GitHub stacks</span>
						<h2 id="stack-dialog-title">{title}</h2>
					</div>
					<button
						aria-label="Close"
						className="icon-button"
						onClick={onClose}
						type="button"
					>
						<XIcon />
					</button>
				</header>
				{mode === "create" ? (
					<p>
						Enter pull request numbers in dependency order, from the bottom
						layer to the top layer. All pull requests must be in this
						repository.
					</p>
				) : mode === "add" ? (
					<p>
						Append one or more existing pull requests to stack #{stackNumber} in
						their dependency order.
					</p>
				) : (
					<p>
						GitHub removes only unmerged layers. Merged or queued layers stay
						linked to the stack.
					</p>
				)}
				{isUnstack ? null : (
					<label className="stack-number-input">
						<span>Pull request numbers</span>
						<input
							aria-label="Pull request numbers"
							autoFocus
							onChange={(event) => setValue(event.target.value)}
							placeholder={mode === "create" ? "101, 102, 103" : "104, 105"}
							value={value}
						/>
					</label>
				)}
				{error ? <p className="stack-dialog-error">{error}</p> : null}
				<footer>
					<button
						className="secondary"
						disabled={busy}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className={isUnstack ? "danger-button" : "merge-button"}
						disabled={busy}
						onClick={() => void submit()}
						type="button"
					>
						{busy ? "Working…" : isUnstack ? "Unstack" : title}
					</button>
				</footer>
			</section>
		</div>
	);
}

function StackPanel({
	detail,
	onMutate,
	onNavigate,
}: {
	detail: PullDetail;
	onMutate(action: () => Promise<unknown>): Promise<boolean>;
	onNavigate(number: number): Promise<void>;
}) {
	const [dialog, setDialog] = useState<StackDialogMode | null>(null);
	const stack = detail.stack;
	const runDialogAction = async (numbers: number[]): Promise<boolean> => {
		if (dialog === "create") {
			return onMutate(() =>
				createStack(repoName(detail), detail.number, numbers)
			);
		}
		if (dialog === "add" && stack) {
			return onMutate(() =>
				addStackLayer(repoName(detail), detail.number, stack.number, numbers)
			);
		}
		if (dialog === "unstack" && stack) {
			return onMutate(() =>
				unstack(repoName(detail), detail.number, stack.number)
			);
		}
		return false;
	};
	return (
		<section
			aria-labelledby="stack-heading"
			className="detail-section stack-section"
		>
			<header className="section-heading">
				<div>
					<span className="eyebrow">Dependency order</span>
					<h2 id="stack-heading">
						{stack ? `Stack #${stack.number}` : "Stack"}
						{stack ? <span>{stack.pullRequests.length} layers</span> : null}
					</h2>
				</div>
				<div className="stack-actions">
					{stack ? (
						<>
							<button
								className="secondary"
								onClick={() => setDialog("add")}
								type="button"
							>
								Add layer
							</button>
							<button
								className="danger-text text-button"
								onClick={() => setDialog("unstack")}
								type="button"
							>
								Unstack
							</button>
						</>
					) : (
						<button
							className="secondary"
							onClick={() => setDialog("create")}
							type="button"
						>
							Create stack
						</button>
					)}
				</div>
			</header>
			{stack ? (
				<div className="stack-map">
					<div className="stack-trunk">
						<span>Trunk</span>
						<strong>{stack.baseRefName || "Default branch"}</strong>
					</div>
					{stack.pullRequests.map((entry, index) => (
						<StackLayer
							detail={detail}
							entry={entry}
							index={index}
							key={entry.number}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			) : (
				<p className="muted stack-empty-copy">
					This pull request is independent. Link it with other PRs that target
					one another to review and merge the change in ordered layers.
				</p>
			)}
			{dialog ? (
				<StackDialog
					currentNumber={detail.number}
					mode={dialog}
					onClose={() => setDialog(null)}
					onSubmit={runDialogAction}
					stackNumber={stack?.number}
				/>
			) : null}
		</section>
	);
}

function StackLayer({
	detail,
	entry,
	index,
	onNavigate,
}: {
	detail: PullDetail;
	entry: PullStackEntry;
	index: number;
	onNavigate(number: number): Promise<void>;
}) {
	const merged =
		Boolean(entry.mergedAt) || entry.state.toLowerCase() === "merged";
	const state = entry.isDraft
		? "draft"
		: merged
			? "merged"
			: entry.state.toLowerCase();
	return (
		<button
			className="stack-layer"
			data-current={entry.number === detail.number}
			disabled={entry.number === detail.number}
			onClick={() => void onNavigate(entry.number)}
			type="button"
		>
			<span className="stack-layer-index">L{index + 1}</span>
			<span className="stack-layer-copy">
				<strong>
					#{entry.number} {entry.title ?? "Untitled pull request"}
				</strong>
				<small>
					{entry.baseRefName ?? "?"} <b>←</b> {entry.headRefName ?? "?"}
				</small>
			</span>
			<span className={`stack-state ${state}`}>{state}</span>
		</button>
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
						<PullRequestStatusIcon pull={pull} />
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
			<Tasks body={detail.body} />
			<Subtasks issues={detail.subIssues} />
			<LinkedIssues issues={detail.closingIssuesReferences} />
		</>
	);
}

function Tasks({ body }: { body: string }) {
	const tasks = parsePullTasks(body);
	if (tasks.length === 0) {
		return null;
	}
	const completed = tasks.filter((task) => task.checked).length;
	return (
		<section className="detail-section task-section">
			<header className="section-heading">
				<div>
					<span className="eyebrow">From the PR description</span>
					<h2>Tasks</h2>
				</div>
				<strong className="task-progress">
					{completed}/{tasks.length}
				</strong>
			</header>
			<div className="task-list">
				{tasks.map((task, index) => (
					<TaskRow index={index} key={`${task.text}-${index}`} task={task} />
				))}
			</div>
		</section>
	);
}

function TaskRow({ index, task }: { index: number; task: PullTask }) {
	return (
		<div className="task-row">
			<input
				aria-label={`${task.checked ? "Completed" : "Open"} task ${index + 1}`}
				checked={task.checked}
				readOnly
				type="checkbox"
			/>
			{task.url ? (
				<a href={task.url} rel="noopener" target="_blank">
					{task.text}
				</a>
			) : (
				<span>{task.text}</span>
			)}
		</div>
	);
}

function Subtasks({ issues }: { issues: PullDetail["subIssues"] }) {
	if (issues.length === 0) {
		return null;
	}
	const completed = issues.filter((issue) => {
		const state = issue.state.toLowerCase();
		return state === "closed" || state === "merged";
	}).length;
	return (
		<section className="detail-section subtask-section">
			<header className="section-heading">
				<div>
					<span className="eyebrow">GitHub sub-issues</span>
					<h2>Subtasks</h2>
				</div>
				<strong className="task-progress">
					{completed}/{issues.length}
				</strong>
			</header>
			<div className="subtask-list">
				{issues.map((issue) => (
					<a
						className="subtask-row"
						href={issue.url}
						key={`${issue.repository?.nameWithOwner ?? "repository"}#${issue.number}`}
						rel="noopener"
						target="_blank"
					>
						<span className={`subtask-state ${issue.state.toLowerCase()}`}>
							{issue.state}
						</span>
						<span className="subtask-copy">
							<strong>
								{issue.repository?.nameWithOwner ?? "Issue"}#{issue.number}
							</strong>
							<span>{issue.title}</span>
						</span>
					</a>
				))}
			</div>
		</section>
	);
}

function LinkedIssues({
	issues,
}: {
	issues: PullDetail["closingIssuesReferences"];
}) {
	if (issues.length === 0) {
		return null;
	}
	return (
		<section className="detail-section linked-issues">
			<h2>Linked issues</h2>
			<div className="linked-issue-list">
				{issues.map((issue) => (
					<a
						href={issue.url}
						key={`${issue.repository?.nameWithOwner ?? "repository"}#${issue.number}`}
						rel="noopener"
						target="_blank"
					>
						<strong>
							{issue.repository?.nameWithOwner ?? "Issue"}#{issue.number}
						</strong>
						<span>{issue.title ?? "Linked issue"}</span>
					</a>
				))}
			</div>
		</section>
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
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<"comment" | "approve" | "request_changes">(
		"comment"
	);
	const submit = async () => {
		if (!body.trim() && mode !== "approve") {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			if (mode === "comment") {
				await addComment(repoName(detail), detail.number, body);
			} else {
				await addReview(repoName(detail), detail.number, mode, body);
			}
			setBody("");
			await onDone();
		} catch (caught) {
			setError(errorText(caught));
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
			{error ? (
				<p className="composer-error" role="alert">
					{error}
				</p>
			) : null}
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
	onNavigate,
}: {
	pull: PullSummary | null;
	onMutated(): Promise<void>;
	onNavigate(repo: string, number: number): Promise<void>;
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
	const [mergeNotice, setMergeNotice] = useState<string | null>(null);
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
		setMergeNotice(null);
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
	const mutate = async (action: () => Promise<unknown>): Promise<boolean> => {
		setLoading(true);
		try {
			await action();
			await load();
			await onMutated();
			return true;
		} catch (caught) {
			setError(errorText(caught));
			return false;
		} finally {
			setLoading(false);
		}
	};
	const pollMerge = async (requestId: string) => {
		for (let attempt = 0; attempt < 12; attempt += 1) {
			await wait(2500);
			try {
				const result = await getMergeStatus(
					repoName(detail),
					detail.number,
					requestId
				);
				if (result.status === "pending") {
					continue;
				}
				setMergeNotice(
					result.details?.message ??
						(result.status === "merged"
							? "Stack merged successfully."
							: "Stack merge finished; refresh to see the latest state.")
				);
				await load();
				await onMutated();
				return;
			} catch (caught) {
				setMergeNotice(`Stack merge status unavailable: ${errorText(caught)}`);
				return;
			}
		}
		setMergeNotice(
			"Stack merge is still running. Refresh to check its status."
		);
	};
	const merge = async (
		strategy: "merge" | "rebase" | "squash",
		mergeAction: "default" | "direct_merge" | "merge_queue",
		label: string
	) => {
		setMergeOpen(false);
		setMergeNotice(null);
		setLoading(true);
		try {
			const result = await mergePull(
				repoName(detail),
				detail.number,
				strategy,
				mergeAction === "merge_queue",
				mergeAction
			);
			setMergeNotice(`${label} submitted.`);
			await load();
			await onMutated();
			const requestId = result.result?.details?.uuid;
			if (requestId) {
				setMergeNotice(`${label} queued; waiting for GitHub…`);
				void pollMerge(requestId);
			}
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
						<PullIcon /> {detail.stack ? "Merge stack" : "Merge"}
					</button>
					{mergeOpen ? (
						<div className="merge-menu">
							{detail.stack ? (
								<>
									<button
										onClick={() =>
											void merge(
												"squash",
												"default",
												`Merge stack through #${detail.number}`
											)
										}
										type="button"
									>
										Merge stack through #{detail.number}
									</button>
									<button
										onClick={() =>
											void merge(
												"squash",
												"merge_queue",
												`Queue stack through #${detail.number}`
											)
										}
										type="button"
									>
										Queue stack through #{detail.number}
									</button>
									<button
										onClick={() =>
											void merge(
												"merge",
												"direct_merge",
												`Merge stack directly through #${detail.number}`
											)
										}
										type="button"
									>
										Merge directly with a merge commit
									</button>
								</>
							) : (
								<>
									<button
										onClick={() =>
											void merge("merge", "default", "Merge commit")
										}
										type="button"
									>
										Create merge commit
									</button>
									<button
										onClick={() =>
											void merge("squash", "default", "Squash merge")
										}
										type="button"
									>
										Squash and merge
									</button>
									<button
										onClick={() =>
											void merge("rebase", "default", "Rebase merge")
										}
										type="button"
									>
										Rebase and merge
									</button>
									<button
										onClick={() =>
											void merge("squash", "merge_queue", "Auto-merge")
										}
										type="button"
									>
										Auto-merge when ready
									</button>
								</>
							)}
						</div>
					) : null}
				</div>
			</header>
			{mergeNotice ? (
				<p aria-live="polite" className="merge-notice" role="status">
					{mergeNotice}
				</p>
			) : null}
			<div className="detail-scroll">
				<div className="detail-heading">
					<PullRequestStatusIcon pull={detail} />
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
						<StackPanel
							detail={detail}
							onMutate={mutate}
							onNavigate={(number) => onNavigate(repoName(detail), number)}
						/>
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

function PullRequestInbox({
	onViewChange,
}: {
	onViewChange(view: AppView): void;
}) {
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
	const navigateToPull = useCallback(async (repo: string, number: number) => {
		try {
			setSelected(await getPull(repo, number));
		} catch (caught) {
			setError(errorText(caught));
		}
	}, []);
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
		<>
			<section className={`inbox ${selected ? "has-selection" : ""}`}>
				<header className="inbox-header">
					<div className="inbox-topline">
						<WorkspaceTabs active="pulls" onChange={onViewChange} />
						<span>{subtitle}</span>
					</div>
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
				<DetailPane
					onMutated={load}
					onNavigate={navigateToPull}
					pull={selected}
				/>
			</section>
		</>
	);
}

export function App() {
	const [view, setView] = useState<AppView>("pulls");
	useEffect(() => subscribeTheme(), []);
	return (
		<main className="app-shell">
			{view === "pulls" ? (
				<PullRequestInbox onViewChange={setView} />
			) : (
				<IssueInbox onViewChange={setView} />
			)}
		</main>
	);
}
