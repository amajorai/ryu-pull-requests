import {
	IssueClosedIcon,
	IssueIcon,
	PullClosedIcon,
	PullDraftIcon,
	PullIcon,
	PullMergedIcon,
} from "./icons.tsx";
import {
	type PullRequestStatus,
	pullRequestStatus,
	pullRequestStatusLabel,
} from "./status.ts";
import type { IssueSummary, PullSummary } from "./types.ts";

export function Avatar({
	actor,
}: {
	actor?: import("./types.ts").Actor | null;
}) {
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

export function PullRequestStatusIcon({ pull }: { pull: PullSummary }) {
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

export function IssueStatusIcon({ issue }: { issue: IssueSummary }) {
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
