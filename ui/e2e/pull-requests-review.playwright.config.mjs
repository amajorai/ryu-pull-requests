import base from "./pull-requests-companion.playwright.config.mjs";

export default {
	...base,
	workers: 1,
	testMatch: "pull-requests-review.spec.mjs",
	outputDir: process.env.RYU_PULL_REQUESTS_RESULTS_DIR ?? "test-results/review",
};
