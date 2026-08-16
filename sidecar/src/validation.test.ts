import { describe, expect, test } from "bun:test";
import {
	parseBody,
	parseLimit,
	parsePullKey,
	parseScope,
	parseState,
} from "./validation.ts";

describe("pull request input validation", () => {
	test("accepts an owner/name key and positive number", () => {
		expect(parsePullKey("openai/codex", "42")).toEqual({
			repo: "openai/codex",
			number: 42,
		});
	});

	test("rejects values that could become gh option injection", () => {
		expect(() => parsePullKey("--repo", 1)).toThrow();
		expect(() => parsePullKey("owner/repo/extra", 1)).toThrow();
		expect(() => parsePullKey("owner/repo", "--help")).toThrow();
	});

	test("bounds list inputs and validates enums", () => {
		expect(parseLimit("999")).toBe(100);
		expect(parseLimit("0")).toBe(1);
		expect(parseScope("reviewing")).toBe("reviewing");
		expect(parseState("merged")).toBe("merged");
		expect(() => parseScope("mine")).toThrow();
	});

	test("trims bodies and rejects empty text", () => {
		expect(parseBody("  looks good  ")).toBe("looks good");
		expect(() => parseBody("   ")).toThrow();
	});
});
