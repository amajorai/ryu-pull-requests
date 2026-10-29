import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	namedAssertionIsPresent,
	reconcileLocalInteractionMap,
} from "../../../../apps-store/companion-suite.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "../../..");
const inventoryPath = path.join(
	repositoryRoot,
	"docs/proof/test-coverage-sweep-20260924/companion-interaction-inventory.tsv"
);
const mapPath = path.join(import.meta.dirname, "companion-interactions.json");
const specPath = path.join(
	import.meta.dirname,
	"pull-requests-companion.spec.mjs"
);
const map = JSON.parse(readFileSync(mapPath, "utf8"));

function currentPullRequestRows() {
	const lines = readFileSync(inventoryPath, "utf8").trim().split(/\r?\n/);
	const headers = lines[0].split("\t");
	return lines
		.slice(1)
		.map((line) => {
			const fields = line.split("\t");
			return Object.fromEntries(
				headers.map((header, index) => [header, fields[index] ?? ""])
			);
		})
		.filter((row) => row.package === "pull-requests");
}

function identity(row) {
	return JSON.stringify(
		["package", "source_file", "line", "component", "tag", "events"].map(
			(field) => row[field]
		)
	);
}

describe("Pull Requests package-owned Companion interaction map", () => {
	test("both local rendered assertions join to their exact current census rows", () => {
		const rows = currentPullRequestRows();
		const reconciled = reconcileLocalInteractionMap("pull-requests", rows, map);
		const specSource = readFileSync(specPath, "utf8");
		const absent = reconciled.filter(
			({ assertion }) =>
				!namedAssertionIsPresent(
					specSource,
					assertion.testTitle,
					assertion.assertionMarker
				)
		);

		expect(map.scope).toBe("partial");
		expect(map.expectedRows).toBe(2);
		expect(reconciled).toHaveLength(2);
		expect(new Set(reconciled.map(({ row }) => identity(row))).size).toBe(2);
		expect(absent).toEqual([]);
	});

	test("the package map rejects omitted, duplicate, and stale identities", () => {
		const rows = currentPullRequestRows();
		expect(() =>
			reconcileLocalInteractionMap("pull-requests", rows, {
				...map,
				assertions: map.assertions.slice(0, -1),
			})
		).toThrow("expected 2 rows but contains 1");
		expect(() =>
			reconcileLocalInteractionMap("pull-requests", rows, {
				...map,
				assertions: [...map.assertions, map.assertions[0]],
				expectedRows: 3,
			})
		).toThrow("duplicates an interaction identity");

		const mapped = new Set(
			map.assertions.map((assertion) => identity(assertion.row))
		);
		expect(() =>
			reconcileLocalInteractionMap(
				"pull-requests",
				rows.filter((row) => !mapped.has(identity(row))),
				map
			)
		).toThrow("does not match exactly one current central census row");
	});
});
