import { RyuAppMain, RyuAppToolbar } from "@ryu/blocks/companion/app-ui";
import { Button, Input } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText, repoName } from "./App-format.ts";
import { GitHubSetup } from "./App-github-setup.tsx";
import { IssueInbox } from "./App-issue-inbox.tsx";
import { DetailPane } from "./App-pull-detail.tsx";
import { PullList } from "./App-pull-summary.tsx";
import { getPull, getStatus, listPulls } from "./api.ts";
import { RefreshIcon, SearchIcon } from "./icons.tsx";
import { parsePullRequestLink } from "./pull-request-link.ts";
import type { ProviderStatus, PullSummary } from "./types.ts";

export { StackDialog } from "./App-stack.tsx";

type AppView = "issues" | "pulls";

function PullRequestInbox() {
	const tl = useLiteralMessages();
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
						{loading
							? "Refreshing…"
							: tl("{count} pull requests", { count: pulls.length })}
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
