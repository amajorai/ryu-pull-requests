import {
	RyuAppList,
	RyuAppListItem,
	RyuAppToolbar,
} from "@ryu/blocks/companion/app-ui";
import { Button, Textarea } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import { useCallback, useEffect, useState } from "react";
import { errorText, issueRepoName, timeAgo } from "./App-format.ts";
import { PullRequestMarkdown } from "./App-markdown.tsx";
import { Avatar, IssueStatusIcon } from "./App-status-icons.tsx";
import type { MutationResult } from "./api.ts";
import { addIssueComment, getIssue, setIssueState } from "./api.ts";
import { ExternalIcon, IssueIcon, MessageIcon } from "./icons.tsx";
import type { IssueDetail, IssueSummary } from "./types.ts";

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

export function IssueList({
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
	const tl = useLiteralMessages();
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
					<strong>
						{tl("{count} comments", { count: detail.comments.length })}
					</strong>
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

export function IssueDetailPane({
	issue,
	onMutated,
}: {
	issue: IssueSummary | null;
	onMutated(): Promise<void>;
}) {
	const tl = useLiteralMessages();
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
								{tl("opened #{number} {age} ago in {repository}", {
									age: timeAgo(detail.createdAt),
									number: detail.number,
									repository: issueRepoName(detail),
								})}
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
