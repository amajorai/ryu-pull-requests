// The detail headers say when a pull request or issue was opened. They pass a
// whole relative phrase ("5 min. ago", "vor 5 Min.", "now") into the message
// rather than wrapping a compact age in an "{age} ago" frame, which read "now
// ago" / "vor jetzt" under a minute and glued a bare unit into other grammars.

import { activeLocale, formatRelativeTime } from "@ryu/i18n/core";
import type { LiteralMessage } from "@ryu/i18n/react";

interface AgeOptions {
	locale?: string;
	now?: number;
}

/** When `value` happened, as a short relative phrase in the shown locale. */
export function openedAge(value: string, options: AgeOptions = {}): string {
	return formatRelativeTime(options.locale ?? activeLocale(), value, {
		now: options.now,
		style: "short",
	});
}

interface OpenedItem {
	createdAt: string;
	number: number;
	repository: string;
}

/** "owner/repo #12 · 5 min. ago" under a pull request title. */
export function pullOpenedLine(
	tl: LiteralMessage,
	item: OpenedItem,
	options: AgeOptions = {}
): string {
	return tl("{repository} #{number} · {age}", {
		age: openedAge(item.createdAt, options),
		number: String(item.number),
		repository: item.repository,
	});
}

/** "opened #12 5 min. ago in owner/repo" under an issue title. */
export function issueOpenedLine(
	tl: LiteralMessage,
	item: OpenedItem,
	options: AgeOptions = {}
): string {
	return tl("opened #{number} {age} in {repository}", {
		age: openedAge(item.createdAt, options),
		number: String(item.number),
		repository: item.repository,
	});
}
