import { useAppAssistant } from "@ryu/app-host/assistant-client";
import { RyuAppToolbar } from "@ryu/blocks/companion/app-ui";
import { Button } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ryu/ui/components/dropdown-menu.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@ryu/ui/components/tabs.tsx";
import { useCallback, useEffect, useState } from "react";
import { errorText, repoName, wait } from "./App-format.ts";
import {
	Activity,
	Code,
	Composer,
	PullHeading,
	ReviewOverview,
} from "./App-pull-review.tsx";
import { Summary } from "./App-pull-summary.tsx";
import { StackPanel } from "./App-stack.tsx";
import { buildReviewContext, buildReviewSurface } from "./ai-review.ts";
import type { MutationResult } from "./api.ts";
import {
	getDiff,
	getMergeStatus,
	getPull,
	mergePull,
	setDraft,
} from "./api.ts";
import { ExternalIcon, PullIcon } from "./icons.tsx";
import type { PullDetail, PullSummary } from "./types.ts";

export function DetailPane({
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
	const tl = useLiteralMessages();
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
											{tl("Merge stack through #{number}", {
												number: detail.number,
											})}
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
											{tl("Queue stack through #{number}", {
												number: detail.number,
											})}
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
