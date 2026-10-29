import {
	RyuAppList,
	RyuAppListItem,
	RyuAppMain,
	RyuAppToolbar,
} from "@ryu/blocks/companion/app-ui";
import { Button, Input, Textarea } from "@ryu/blocks/companion/controls";
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ryu/ui/components/dialog.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ryu/ui/components/dropdown-menu.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@ryu/ui/components/tabs.tsx";
import {
	isViewVisible,
	subscribeViewVisibility,
} from "@ryu/ui/lib/view-visibility.ts";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MutationResult } from "./api.ts";
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
import styles from "./pull-requests.module.css";
import { reviewModeSchema } from "./schemas.ts";

function safeExternalUrl(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.href
			: null;
	} catch {
		return null;
	}
}

function PullRequestMarkdown({
	className,
	content,
}: {
	className?: string;
	content: string;
}) {
	const classes = ["markdown-body", className].filter(Boolean).join(" ");
	return (
		<div className={classes}>
			<ReactMarkdown
				components={{
					a: ({ children, href }) => {
						const safeUrl = safeExternalUrl(href);
						return safeUrl ? (
							<a href={safeUrl} rel="noopener noreferrer" target="_blank">
								{children}
							</a>
						) : (
							<span>{children}</span>
						);
					},
					img: () => null,
					input: () => <span aria-hidden="true" />,
				}}
				remarkPlugins={[remarkGfm]}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}

import { useAppAssistant } from "@ryu/app-host/assistant-client";
import { buildReviewContext, buildReviewSurface } from "./ai-review.ts";
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
import { parsePullRequestLink } from "./pull-request-link.ts";
import {
	type PullRequestStatus,
	pullRequestStatus,
	pullRequestStatusLabel,
} from "./status.ts";
import { type PullTask, parsePullTasks, stripPullTasks } from "./tasks.ts";
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

const errorText = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);
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
		<RyuAppList aria-label="Issues" className="pull-list">
			{issues.map((issue) => {
				const key = `${issueRepoName(issue)}#${issue.number}`;
				return (
					<RyuAppListItem
						accessories={
							<span className="pull-row-aside">
								<time>{timeAgo(issue.updatedAt)}</time>
								{issue.commentsCount > 0 ? (
									<span>
										{issue.commentsCount}{" "}
										{issue.commentsCount === 1 ? "comment" : "comments"}
									</span>
								) : null}
							</span>
						}
						icon={<IssueStatusIcon issue={issue} />}
						key={key}
						onClick={() => onSelect(issue)}
						selected={selected === key}
						subtitle={
							<span>{`${issueRepoName(issue)} · #${issue.number}`}</span>
						}
						title={<span>{issue.title}</span>}
					/>
				);
			})}
		</RyuAppList>
	);
}

function IssueSummaryPanel({ detail }: { detail: IssueDetail }) {
	return (
		<>
			<section className="summary-grid">
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
					{detail.body ? (
						<PullRequestMarkdown content={detail.body} />
					) : (
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
		<section className="detail-section">
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
							<PullRequestMarkdown
								className="activity-markdown"
								content={item.body}
							/>
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
			<Textarea
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
				<Button
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
				</Button>
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
				<Button onClick={load} type="button">
					Try again
				</Button>
			</div>
		);
	}
	const closed = detail.state.toLowerCase() === "closed";
	const mutate = async (action: () => Promise<MutationResult>) => {
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
			<RyuAppToolbar className="detail-toolbar">
				<span aria-current="page" className="detail-current-view">
					Summary
				</span>
				<div>
					<Button
						aria-label="Open on GitHub"
						onClick={() => window.ryu?.ui?.openExternal?.({ url: detail.url })}
						size="icon-sm"
						title="Open on GitHub"
						type="button"
						variant="ghost"
					>
						<ExternalIcon />
					</Button>
					<Button
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
						variant="outline"
					>
						{closed ? "Reopen issue" : "Close issue"}
					</Button>
				</div>
			</RyuAppToolbar>
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

function IssueInbox() {
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
					<div className={styles.inboxTopline}>
						<span>{subtitle}</span>
					</div>
					<div className="scope-tabs">
						<Button
							aria-selected={scope === "all"}
							onClick={() => setScope("all")}
							type="button"
						>
							All
						</Button>
						<Button
							aria-selected={scope === "assigned"}
							onClick={() => setScope("assigned")}
							type="button"
						>
							Assigned
						</Button>
						<Button
							aria-selected={scope === "authored"}
							onClick={() => setScope("authored")}
							type="button"
						>
							Authored
						</Button>
					</div>
				</header>
				<div className="search-row">
					<label>
						<SearchIcon />
						<Input
							aria-label="Search issues"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search issues"
							value={query}
						/>
					</label>
					<Button
						aria-label="Refresh"
						disabled={loading}
						onClick={load}
						size="icon-sm"
						title="Refresh"
						type="button"
						variant="ghost"
					>
						<RefreshIcon />
					</Button>
				</div>
				<div className="filters">
					<NativeSelect
						aria-label="Issue state"
						onChange={(event) => setState(event.target.value)}
						value={state}
					>
						<NativeSelectOption value="open">Open</NativeSelectOption>
						<NativeSelectOption value="closed">Closed</NativeSelectOption>
					</NativeSelect>
					<span>{loading ? "Refreshing…" : `${issues.length} issues`}</span>
				</div>
				{error ? (
					status ? (
						<div className="setup-error">
							<h2>Couldn’t load issues</h2>
							<p>{error}</p>
							<Button onClick={load} type="button">
								Try again
							</Button>
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
				<Button
					className="mobile-back"
					onClick={() => setSelected(null)}
					type="button"
				>
					← Issues
				</Button>
				<IssueDetailPane issue={selected} onMutated={load} />
			</section>
		</>
	);
}

type AppView = "issues" | "pulls";

function Avatar({ actor }: { actor?: import("./types.ts").Actor | null }) {
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

export function StackDialog({
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
		<Dialog
			onOpenChange={(next) => {
				if (!(next || busy)) {
					onClose();
				}
			}}
			open
		>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						Manage the dependency order of pull requests.
					</DialogDescription>
				</DialogHeader>
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
						<Input
							aria-label="Pull request numbers"
							onChange={(event) => setValue(event.target.value)}
							placeholder={mode === "create" ? "101, 102, 103" : "104, 105"}
							value={value}
						/>
					</label>
				)}
				{error ? <p className="stack-dialog-error">{error}</p> : null}
				<footer>
					<Button
						disabled={busy}
						onClick={onClose}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={busy}
						onClick={() => void submit()}
						type="button"
						variant={isUnstack ? "destructive" : "default"}
					>
						{busy ? "Working…" : isUnstack ? "Unstack" : title}
					</Button>
				</footer>
			</DialogContent>
		</Dialog>
	);
}

function StackPanel({
	detail,
	onMutate,
	onNavigate,
}: {
	detail: PullDetail;
	onMutate(action: () => Promise<MutationResult>): Promise<boolean>;
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
		<section aria-labelledby="stack-heading" className="detail-section">
			<header className="section-heading">
				<div>
					<h2 id="stack-heading">
						{stack ? `Stack #${stack.number}` : "Stack"}
						{stack ? <span>{stack.pullRequests.length} layers</span> : null}
					</h2>
				</div>
				<div className="stack-actions">
					{stack ? (
						<>
							<Button
								onClick={() => setDialog("add")}
								type="button"
								variant="outline"
							>
								Add layer
							</Button>
							<Button
								onClick={() => setDialog("unstack")}
								type="button"
								variant="destructive"
							>
								Unstack
							</Button>
						</>
					) : (
						<Button
							onClick={() => setDialog("create")}
							type="button"
							variant="outline"
						>
							Create stack
						</Button>
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
		<Button
			className="stack-layer h-auto"
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
		</Button>
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
		<RyuAppList aria-label="Pull requests" className="pull-list">
			{pulls.map((pull) => {
				const key = `${repoName(pull)}#${pull.number}`;
				return (
					<RyuAppListItem
						accessories={
							<span className="pull-row-aside">
								<time>{timeAgo(pull.updatedAt)}</time>
								{pull.commentsCount > 0 ? (
									<span>
										{pull.commentsCount}{" "}
										{pull.commentsCount === 1 ? "comment" : "comments"}
									</span>
								) : null}
							</span>
						}
						icon={<PullRequestStatusIcon pull={pull} />}
						key={key}
						onClick={() => onSelect(pull)}
						selected={selected === key}
						subtitle={<span>{`${repoName(pull)} · #${pull.number}`}</span>}
						title={<span>{pull.title}</span>}
					/>
				);
			})}
		</RyuAppList>
	);
}

function Summary({ detail }: { detail: PullDetail }) {
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
					<span>Changed files</span>
					<strong>{detail.changedFiles}</strong>
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
					{detail.body ? (
						<PullRequestMarkdown content={stripPullTasks(detail.body)} />
					) : (
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
		<section className="detail-section">
			<header className="section-heading">
				<div>
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
	const url = task.url ? safeExternalUrl(task.url) : null;
	return (
		<div className="task-row">
			<Checkbox
				aria-label={`${task.checked ? "Completed" : "Open"} task ${index + 1}`}
				checked={task.checked}
				readOnly
			/>
			{url ? (
				<a href={url} rel="noopener" target="_blank">
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
		<section className="detail-section">
			<header className="section-heading">
				<div>
					<h2>Subtasks</h2>
				</div>
				<strong className="task-progress">
					{completed}/{issues.length}
				</strong>
			</header>
			<div className="subtask-list">
				{issues.map((issue) => {
					const url = safeExternalUrl(issue.url);
					return url ? (
						<a
							className="subtask-row"
							href={url}
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
					) : null;
				})}
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
		<section className="detail-section">
			<h2>Linked issues</h2>
			<div className="linked-issue-list">
				{issues.map((issue) => {
					const url = safeExternalUrl(issue.url);
					return url ? (
						<a
							href={url}
							key={`${issue.repository?.nameWithOwner ?? "repository"}#${issue.number}`}
							rel="noopener"
							target="_blank"
						>
							<strong>
								{issue.repository?.nameWithOwner ?? "Issue"}#{issue.number}
							</strong>
							<span>{issue.title ?? "Linked issue"}</span>
						</a>
					) : null;
				})}
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
		<div>
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
				<Button disabled={loading} onClick={onLoad} type="button">
					{loading ? "Loading patch…" : "Load full patch"}
				</Button>
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
		<section className="detail-section">
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
							<PullRequestMarkdown
								className="activity-markdown"
								content={item.body}
							/>
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

function ReviewOverview({ detail }: { detail: PullDetail }) {
	const mergeStatus =
		detail.mergeable === "MERGEABLE"
			? "No conflicts"
			: detail.mergeable === "CONFLICTING"
				? "Conflicts found"
				: "Checking mergeability";
	const decision = detail.isDraft
		? "Draft"
		: detail.reviewDecision === "APPROVED"
			? "Approved"
			: detail.reviewDecision === "CHANGES_REQUESTED"
				? "Changes requested"
				: detail.reviewDecision === "REVIEW_REQUIRED"
					? "Review required"
					: "Review in progress";
	const reviewers = [
		...detail.reviewRequests.flatMap((item) =>
			item.requestedReviewer
				? [{ actor: item.requestedReviewer, state: "Requested" }]
				: []
		),
		...detail.latestReviews.map((review) => ({
			actor: review.author,
			state: review.state.replaceAll("_", " ").toLowerCase(),
		})),
	];

	return (
		<div className="review-overview">
			<header className="review-rail-heading">
				<h2>Review details</h2>
				<span className="review-decision">{decision}</span>
			</header>
			<section className="review-card">
				<h3>Merge status</h3>
				<p className="merge-status">
					<span
						aria-hidden="true"
						className={`merge-status-dot ${detail.mergeable === "MERGEABLE" ? "good" : detail.mergeable === "CONFLICTING" ? "bad" : "pending"}`}
					/>
					{mergeStatus}
				</p>
				<p className="review-card-note">
					{detail.mergeStateStatus.replaceAll("_", " ").toLowerCase()}
				</p>
			</section>
			<section className="review-card">
				<h3>
					Reviewers <span>{reviewers.length}</span>
				</h3>
				{reviewers.length === 0 ? (
					<p className="review-card-note">No reviewers requested</p>
				) : (
					<div className="reviewer-list">
						{reviewers.map((reviewer, index) => (
							<div
								className="reviewer-row"
								key={`${reviewer.actor?.login ?? "reviewer"}-${index}`}
							>
								<Avatar actor={reviewer.actor} />
								<strong>{reviewer.actor?.login ?? "Unknown reviewer"}</strong>
								<span>{reviewer.state}</span>
							</div>
						))}
					</div>
				)}
			</section>
			<section className="review-card review-comments">
				<h3>Comments</h3>
				<p>
					{detail.comments.length === 0
						? "No discussion yet"
						: `${detail.comments.length} ${detail.comments.length === 1 ? "comment" : "comments"}`}
				</p>
			</section>
			<Checks detail={detail} />
		</div>
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
			<Textarea
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
				<NativeSelect
					aria-label="Comment type"
					onChange={(event) => {
						const next = reviewModeSchema.safeParse(event.target.value);
						if (next.success) {
							setMode(next.data);
						}
					}}
					value={mode}
				>
					<NativeSelectOption value="comment">Comment</NativeSelectOption>
					<NativeSelectOption value="approve">Approve</NativeSelectOption>
					<NativeSelectOption value="request_changes">
						Request changes
					</NativeSelectOption>
				</NativeSelect>
				<Button
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
				</Button>
			</footer>
		</div>
	);
}

function PullHeading({ detail }: { detail: PullDetail }) {
	return (
		<div className="detail-heading">
			<PullRequestStatusIcon pull={detail} />
			<div>
				<h1>{detail.title}</h1>
				<p>
					<Avatar actor={detail.author} />
					<strong>{detail.author?.login ?? "Unknown"}</strong>
					<span>
						{repoName(detail)} <b>#{detail.number}</b> ·{" "}
						{timeAgo(detail.createdAt)} ago
					</span>
				</p>
			</div>
		</div>
	);
}

function DetailPane({
	pull,
	onMutated,
	onNavigate,
	mergeNotice,
	onMergeNotice,
}: {
	mergeNotice: string | null;
	onMergeNotice(notice: string | null): void;
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
	// The diff feeds both the Changes tab and the global assistant's context, so
	// it reloads with the PR (including after a merge or review refresh). A stale
	// response for a previously loaded PR is dropped rather than shown.
	useEffect(() => {
		if (!detail) {
			return;
		}
		let current = true;
		getDiff(repoName(detail), detail.number)
			.then((diff) => {
				if (current) {
					setPatch(diff);
				}
			})
			.catch(() => {
				// The assistant still gets the summary; the Changes tab retries.
			});
		return () => {
			current = false;
		};
	}, [detail]);
	// "Ask about this PR" is the global Ask Ryu assistant, not a pane of ours:
	// publish the selected PR as context and lend it the review surface.
	// Only while the detail is what the user sees: an error view must not leave
	// the previous PR steering the assistant.
	const visibleDetail = detail && !error ? detail : null;
	useAppAssistant({
		context: visibleDetail
			? buildReviewContext({ detail: visibleDetail, diff: patch })
			: null,
		surface: visibleDetail ? buildReviewSurface(visibleDetail) : null,
	});
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
				<Button onClick={load} type="button">
					Try again
				</Button>
			</div>
		);
	}
	const mutate = async (
		action: () => Promise<MutationResult>
	): Promise<boolean> => {
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
				onMergeNotice(
					result.details?.message ??
						(result.status === "merged"
							? "Stack merged successfully."
							: "Stack merge finished; refresh to see the latest state.")
				);
				await load();
				await onMutated();
				return;
			} catch (caught) {
				onMergeNotice(`Stack merge status unavailable: ${errorText(caught)}`);
				return;
			}
		}
		onMergeNotice("Stack merge is still running. Refresh to check its status.");
	};
	const merge = async (
		strategy: "merge" | "rebase" | "squash",
		mergeAction: "default" | "direct_merge" | "merge_queue",
		label: string
	) => {
		setMergeOpen(false);
		onMergeNotice(null);
		setLoading(true);
		try {
			const result = await mergePull(
				repoName(detail),
				detail.number,
				strategy,
				mergeAction === "merge_queue",
				mergeAction
			);
			onMergeNotice(`${label} submitted.`);
			await load();
			await onMutated();
			const requestId = result.result?.details?.uuid;
			if (requestId) {
				onMergeNotice(`${label} queued; waiting for GitHub…`);
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
			<Tabs
				className="min-h-0 min-w-0 flex-1 flex-col"
				onValueChange={(value) => {
					if (value === "summary" || value === "code") {
						setTab(value);
					}
				}}
				spacing="flush"
				value={tab}
			>
				<RyuAppToolbar className="detail-toolbar">
					<TabsList
						aria-label="Pull request sections"
						className="shrink-0"
						variant="segmented"
					>
						<TabsTrigger density="review" value="summary">
							Summary
						</TabsTrigger>
						<TabsTrigger density="review" value="code">
							Changes{" "}
							<span className="detail-change-count">{detail.changedFiles}</span>
						</TabsTrigger>
					</TabsList>
					<div>
						<Button
							aria-label="Open on GitHub"
							onClick={openExternal}
							size="icon-sm"
							title="Open on GitHub"
							type="button"
							variant="ghost"
						>
							<ExternalIcon />
						</Button>
						{detail.isDraft ? (
							<Button
								disabled={loading}
								onClick={() =>
									mutate(() => setDraft(repoName(detail), detail.number, false))
								}
								type="button"
								variant="outline"
							>
								Ready for review
							</Button>
						) : null}
						<DropdownMenu onOpenChange={setMergeOpen} open={mergeOpen}>
							<DropdownMenuTrigger
								render={
									<Button disabled={loading || detail.state !== "OPEN"} />
								}
							>
								<PullIcon /> {detail.stack ? "Merge stack" : "Merge"}
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{detail.stack ? (
									<>
										<DropdownMenuItem
											onClick={() =>
												void merge(
													"squash",
													"default",
													`Merge stack through #${detail.number}`
												)
											}
										>
											Merge stack through #{detail.number}
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() =>
												void merge(
													"squash",
													"merge_queue",
													`Queue stack through #${detail.number}`
												)
											}
										>
											Queue stack through #{detail.number}
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() =>
												void merge(
													"merge",
													"direct_merge",
													`Merge stack directly through #${detail.number}`
												)
											}
										>
											Merge directly with a merge commit
										</DropdownMenuItem>
									</>
								) : (
									<>
										<DropdownMenuItem
											onClick={() =>
												void merge("merge", "default", "Merge commit")
											}
										>
											Create merge commit
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() =>
												void merge("squash", "default", "Squash merge")
											}
										>
											Squash and merge
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() =>
												void merge("rebase", "default", "Rebase merge")
											}
										>
											Rebase and merge
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() =>
												void merge("squash", "merge_queue", "Auto-merge")
											}
										>
											Auto-merge when ready
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</RyuAppToolbar>
				{mergeNotice ? (
					<p aria-live="polite" className="merge-notice" role="status">
						{mergeNotice}
					</p>
				) : null}
				<div className="review-pane-body">
					<TabsContent
						className="col-start-1 row-start-1 h-full min-h-0 w-full min-w-0 overflow-y-auto"
						inset="review"
						value="summary"
					>
						<PullHeading detail={detail} />
						<StackPanel
							detail={detail}
							onMutate={mutate}
							onNavigate={(number) => onNavigate(repoName(detail), number)}
						/>
						<Summary detail={detail} />
						<div className="review-mobile-overview">
							<ReviewOverview detail={detail} />
						</div>
						<Activity detail={detail} />
						<Composer detail={detail} onDone={load} />
					</TabsContent>
					<TabsContent
						className="col-start-1 row-start-1 h-full min-h-0 w-full min-w-0 overflow-y-auto"
						inset="review"
						value="code"
					>
						<PullHeading detail={detail} />
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
					</TabsContent>
					<aside aria-label="Pull request review panel" className="review-rail">
						<ReviewOverview detail={detail} />
					</aside>
				</div>
			</Tabs>
		</div>
	);
}

function PullRequestInbox() {
	const [scope, setScope] = useState("all");
	const [state, setState] = useState("open");
	const [query, setQuery] = useState("");
	const [pulls, setPulls] = useState<PullSummary[]>([]);
	const [selected, setSelected] = useState<PullSummary | null>(null);
	const [status, setStatus] = useState<ProviderStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [mergeNotice, setMergeNotice] = useState<string | null>(null);
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
			const pullLink = parsePullRequestLink(query);
			const nextPulls = pullLink
				? [
						await getPull(
							`${pullLink.owner}/${pullLink.repository}`,
							pullLink.number
						),
					]
				: await listPulls({ query, scope, state });
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
		setMergeNotice(null);
		try {
			setSelected(await getPull(repo, number));
		} catch (caught) {
			setError(errorText(caught));
		}
	}, []);
	useEffect(() => {
		setMergeNotice(null);
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
				<div className="inbox-header">
					<RyuAppToolbar
						actions={<span>{subtitle}</span>}
						className="inbox-heading"
						title="Code Review"
					/>
					<div
						aria-label="Pull request inbox filter"
						className="scope-tabs"
						role="group"
					>
						<Button
							aria-pressed={scope === "all"}
							onClick={() => setScope("all")}
							type="button"
						>
							Inbox
						</Button>
						<Button
							aria-pressed={scope === "reviewing"}
							onClick={() => setScope("reviewing")}
							type="button"
						>
							Needs my review
						</Button>
						<Button
							aria-pressed={scope === "authored"}
							onClick={() => setScope("authored")}
							type="button"
						>
							Authored by me
						</Button>
					</div>
				</div>
				<div className="search-row">
					<label>
						<SearchIcon />
						<Input
							aria-label="Search pull requests"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search or paste a PR link"
							value={query}
						/>
					</label>
					<Button
						aria-label="Refresh"
						disabled={loading}
						onClick={load}
						size="icon-sm"
						title="Refresh"
						type="button"
						variant="ghost"
					>
						<RefreshIcon />
					</Button>
				</div>
				<div className="filters">
					<NativeSelect
						aria-label="Pull request state"
						onChange={(event) => setState(event.target.value)}
						value={state}
					>
						<NativeSelectOption value="open">Open</NativeSelectOption>
						<NativeSelectOption value="merged">Merged</NativeSelectOption>
						<NativeSelectOption value="closed">Closed</NativeSelectOption>
					</NativeSelect>
					<span>
						{loading ? "Refreshing…" : `${pulls.length} pull requests`}
					</span>
				</div>
				{error ? (
					status ? (
						<div className="setup-error">
							<h2>Couldn’t load pull requests</h2>
							<p>{error}</p>
							<Button onClick={load} type="button">
								Try again
							</Button>
						</div>
					) : (
						<GitHubSetup message={error} onAuthenticated={load} />
					)
				) : (
					<PullList
						onSelect={(pull) => {
							setMergeNotice(null);
							setSelected(pull);
						}}
						pulls={pulls}
						selected={selectedKey}
					/>
				)}
			</section>
			<section className={`detail ${selected ? "visible" : ""}`}>
				<Button
					className="mobile-back"
					onClick={() => {
						setMergeNotice(null);
						setSelected(null);
					}}
					type="button"
				>
					← Pull requests
				</Button>
				<DetailPane
					mergeNotice={mergeNotice}
					onMergeNotice={setMergeNotice}
					onMutated={load}
					onNavigate={navigateToPull}
					pull={selected}
				/>
			</section>
		</>
	);
}

export function App() {
	const [view] = useState<AppView>(() => {
		const requested =
			globalThis.window === undefined
				? undefined
				: globalThis.window.ryu?.context?.view;
		return requested === "issues" ? "issues" : "pulls";
	});
	return (
		<RyuAppMain className="app-shell">
			{view === "pulls" ? <PullRequestInbox /> : <IssueInbox />}
		</RyuAppMain>
	);
}
