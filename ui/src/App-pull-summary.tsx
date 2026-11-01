import { RyuAppList, RyuAppListItem } from "@ryu/blocks/companion/app-ui";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import { repoName, timeAgo } from "./App-format.ts";
import { PullRequestMarkdown, safeExternalUrl } from "./App-markdown.tsx";
import { PullRequestStatusIcon } from "./App-status-icons.tsx";
import { PullIcon } from "./icons.tsx";
import { type PullTask, parsePullTasks, stripPullTasks } from "./tasks.ts";
import type { PullDetail, PullSummary } from "./types.ts";

export function PullList({
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

export function Summary({ detail }: { detail: PullDetail }) {
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
	const tl = useLiteralMessages();
	const url = task.url ? safeExternalUrl(task.url) : null;
	return (
		<div className="task-row">
			<Checkbox
				aria-label={
					task.checked
						? tl("Completed task {number}", { number: index + 1 })
						: tl("Open task {number}", { number: index + 1 })
				}
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
