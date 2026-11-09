import { expect, test } from "bun:test";
import { I18nProvider } from "@ryu/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewOverview } from "./App-pull-review.tsx";
import { pullDetail } from "./api-fixtures.ts";
import type { PullDetail } from "./types.ts";

// Rows standing in for the pull-requests catalog rows the extractor adds for
// the review overview's status pills and reviewer states.
const OVERLAYS: Record<string, Record<string, string>> = {
	ar: {
		Commented: "علّق",
		"Merging is blocked": "الدمج محظور",
		"No conflicts": "لا توجد تعارضات",
		"Review required": "المراجعة مطلوبة",
		"Review requested": "طُلبت المراجعة",
	},
	de: {
		Commented: "Kommentiert",
		"Merging is blocked": "Zusammenführen ist blockiert",
		"No conflicts": "Keine Konflikte",
		"Review required": "Überprüfung erforderlich",
		"Review requested": "Überprüfung angefordert",
	},
	ja: {
		Commented: "コメント済み",
		"Merging is blocked": "マージはブロックされています",
		"No conflicts": "競合なし",
		"Review required": "レビューが必要",
		"Review requested": "レビュー依頼済み",
	},
};

const detail: PullDetail = {
	...pullDetail,
	latestReviews: [
		{
			author: { login: "sana", name: null },
			body: "",
			state: "COMMENTED",
			submittedAt: "2026-09-30T12:00:00.000Z",
		},
	],
	mergeStateStatus: "BLOCKED",
	reviewRequests: [{ requestedReviewer: { login: "marco", name: null } }],
};

function overview(locale: string): string {
	return renderToStaticMarkup(
		createElement(
			I18nProvider,
			{
				initialLocale: locale,
				initialPackId: null,
				manageDocument: false,
				overlays: OVERLAYS,
			},
			createElement(ReviewOverview, { detail })
		)
	);
}

test.each([
	"de",
	"ja",
	"ar",
])("renders the status pills and reviewer states in %s", (locale) => {
	const html = overview(locale);
	for (const translated of Object.values(OVERLAYS[locale] ?? {})) {
		expect(html).toContain(translated);
	}
	for (const english of [
		"No conflicts",
		"Review required",
		"Review requested",
		">Commented<",
		"blocked",
		"commented",
	]) {
		expect(html).not.toContain(english);
	}
});

test("keeps the English pills in English", () => {
	const html = overview("en");
	expect(html).toContain("No conflicts");
	expect(html).toContain("Review required");
	expect(html).toContain("Merging is blocked");
	expect(html).toContain("Review requested");
});
