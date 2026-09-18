import { describe, expect, test } from "bun:test";
import { parsePullTasks } from "./tasks.ts";

describe("pull request task lists", () => {
	test("parses checked and open tasks while ignoring fenced examples", () => {
		expect(
			parsePullTasks(
				"- [x] Add the model\n- [ ] Wire the API https://github.com/acme/app/issues/7\n```md\n- [ ] example\n```"
			)
		).toEqual([
			{ checked: true, text: "Add the model" },
			{
				checked: false,
				text: "Wire the API https://github.com/acme/app/issues/7",
				url: "https://github.com/acme/app/issues/7",
			},
		]);
	});
});
