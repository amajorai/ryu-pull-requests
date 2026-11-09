import { describe, expect, it } from "bun:test";
import { formatMessage, type MessageValuesInput } from "@ryu/i18n/lite";
import {
	issueOpenedLine,
	openedAge,
	pullOpenedLine,
} from "./App-detail-age.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const JUST_NOW = new Date(NOW - 20_000).toISOString();
const FIVE_MINUTES = new Date(NOW - 5 * 60_000).toISOString();

// A stub catalog stands in for the shipped one, whose entries for these
// messages arrive with the catalog regeneration.
const CATALOGS: Record<string, Record<string, string>> = {
	ar: {
		"opened #{number} {age} in {repository}":
			"فُتحت #{number} {age} في {repository}",
		"{repository} #{number} · {age}": "{repository} #{number} · {age}",
	},
	de: {
		"opened #{number} {age} in {repository}":
			"hat #{number} {age} in {repository} eröffnet",
		"{repository} #{number} · {age}": "{repository} #{number} · {age}",
	},
};

function translatorFor(locale: string) {
	return (source: string, values?: MessageValuesInput) =>
		formatMessage(CATALOGS[locale]?.[source] ?? source, values, locale);
}

const item = (createdAt: string) => ({
	createdAt,
	number: 12,
	repository: "acme/web",
});

describe("detail header age", () => {
	it("reads under a minute as now, with no ago", () => {
		const line = pullOpenedLine(translatorFor("en"), item(JUST_NOW), {
			locale: "en",
			now: NOW,
		});
		expect(line).toBe("acme/web #12 · now");
		expect(line).not.toContain("ago");
	});

	it("passes a whole relative phrase in German", () => {
		const de = translatorFor("de");
		const age = openedAge(FIVE_MINUTES, { locale: "de", now: NOW });
		expect(age).toStartWith("vor ");
		expect(pullOpenedLine(de, item(JUST_NOW), { locale: "de", now: NOW })).toBe(
			"acme/web #12 · jetzt"
		);
		expect(
			issueOpenedLine(de, item(FIVE_MINUTES), { locale: "de", now: NOW })
		).toBe(`hat #12 ${age} in acme/web eröffnet`);
		expect(
			issueOpenedLine(de, item(JUST_NOW), { locale: "de", now: NOW })
		).not.toContain("vor jetzt");
	});

	it("passes a whole relative phrase in Japanese, with grouping-free numbers", () => {
		const ja = translatorFor("ja");
		const age = openedAge(FIVE_MINUTES, { locale: "ja", now: NOW });
		expect(age).toEndWith("前");
		const line = issueOpenedLine(
			ja,
			{ ...item(FIVE_MINUTES), number: 12_345 },
			{ locale: "ja", now: NOW }
		);
		expect(line).toBe(`opened #12345 ${age} in acme/web`);
		expect(line).not.toContain("ago");
	});

	it("passes a whole relative phrase in Arabic", () => {
		const ar = translatorFor("ar");
		const age = openedAge(FIVE_MINUTES, { locale: "ar", now: NOW });
		expect(age).not.toMatch(/ago|\d+m$/u);
		expect(
			issueOpenedLine(ar, item(FIVE_MINUTES), { locale: "ar", now: NOW })
		).toBe(`فُتحت #12 ${age} في \u2068acme/web\u2069`);
	});
});
