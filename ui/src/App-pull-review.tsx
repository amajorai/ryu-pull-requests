import { Button, Textarea } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { useState } from "react";
import { pullOpenedLine } from "./App-detail-age.ts";
import { errorText, repoName, timeAgo } from "./App-format.ts";
import { PullRequestMarkdown } from "./App-markdown.tsx";
import { Avatar, PullRequestStatusIcon } from "./App-status-icons.tsx";
import { addComment, addReview } from "./api.ts";
import { CheckIcon, FileIcon, MessageIcon, XIcon } from "./icons.tsx";
import {
	mergeStateLabel,
	mergeStatusLabel,
	REVIEW_REQUESTED_STATE,
	reviewDecisionLabel,
	reviewerStateLabel,
} from "./pull-status-labels.ts";
import { reviewModeSchema } from "./schemas.ts";
import type { PullDetail } from "./types.ts";

export function Code({
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

export function Activity({ detail }: { detail: PullDetail }) {
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

export function ReviewOverview({ detail }: { detail: PullDetail }) {
	const tl = useLiteralMessages();
	const mergeStatus = mergeStatusLabel(detail.mergeable, tl);
	const decision = reviewDecisionLabel(detail, tl);
	const reviewers = [
		...detail.reviewRequests.flatMap((item) =>
			item.requestedReviewer
				? [
						{
							actor: item.requestedReviewer,
							state: reviewerStateLabel(REVIEW_REQUESTED_STATE, tl),
						},
					]
				: []
		),
		...detail.latestReviews.map((review) => ({
			actor: review.author,
			state: reviewerStateLabel(review.state, tl),
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
					{mergeStateLabel(detail.mergeStateStatus, tl)}
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
						: tl("{count, plural, one {# comment} other {# comments}}", {
								count: detail.comments.length,
							})}
				</p>
			</section>
			<Checks detail={detail} />
		</div>
	);
}

export function Composer({
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

export function PullHeading({ detail }: { detail: PullDetail }) {
	const tl = useLiteralMessages();
	return (
		<div className="detail-heading">
			<PullRequestStatusIcon pull={detail} />
			<div>
				<h1>{detail.title}</h1>
				<p>
					<Avatar actor={detail.author} />
					<strong>{detail.author?.login ?? "Unknown"}</strong>
					<span>
						{pullOpenedLine(tl, {
							createdAt: detail.createdAt,
							number: detail.number,
							repository: repoName(detail),
						})}
					</span>
				</p>
			</div>
		</div>
	);
}
