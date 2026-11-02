import { Button, Input } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ryu/ui/components/dialog.tsx";
import { useState } from "react";
import { errorText, parseStackInput, repoName } from "./App-format.ts";
import type { MutationResult } from "./api.ts";
import { addStackLayer, createStack, unstack } from "./api.ts";
import type { PullDetail, PullStackEntry } from "./types.ts";

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
	const tl = useLiteralMessages();
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
						{tl(
							"Append one or more existing pull requests to stack #{stackNumber} in their dependency order.",
							{ stackNumber: stackNumber ?? "" }
						)}
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

export function StackPanel({
	detail,
	onMutate,
	onNavigate,
}: {
	detail: PullDetail;
	onMutate(action: () => Promise<MutationResult>): Promise<boolean>;
	onNavigate(number: number): Promise<void>;
}) {
	const tl = useLiteralMessages();
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
						{stack ? tl("Stack #{number}", { number: stack.number }) : "Stack"}
						{stack ? (
							<span>
								{tl("{count} layers", { count: stack.pullRequests.length })}
							</span>
						) : null}
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
