import { Button, Input } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText, issueRepoName } from "./App-format.ts";
import { GitHubSetup } from "./App-github-setup.tsx";
import { IssueDetailPane, IssueList } from "./App-issue-detail.tsx";
import { getStatus, listIssues } from "./api.ts";
import { RefreshIcon, SearchIcon } from "./icons.tsx";
import styles from "./pull-requests.module.css";
import type { IssueSummary, ProviderStatus } from "./types.ts";

export function IssueInbox() {
	const tl = useLiteralMessages();
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
					<span>
						{loading
							? "Refreshing…"
							: tl("{count} issues", { count: issues.length })}
					</span>
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
