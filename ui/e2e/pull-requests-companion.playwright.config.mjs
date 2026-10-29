import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const baseURL = "http://127.0.0.1:49384";

export default {
	fullyParallel: false,
	workers: 1,
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	reporter: "list",
	retries: 0,
	testDir: import.meta.dirname,
	testMatch: [
		"pull-requests-companion.spec.mjs",
		"pull-requests-review.spec.mjs",
	],
	outputDir:
		process.env.RYU_PULL_REQUESTS_RESULTS_DIR ?? "test-results/companion",
	timeout: 45_000,
	use: {
		baseURL,
		headless: true,
		locale: "en-US",
		timezoneId: "UTC",
		viewport: { height: 950, width: 1440 },
	},
	webServer: {
		command:
			"bun run build && bun run vite preview --host 127.0.0.1 --port 49384 --strictPort",
		cwd: appRoot,
		reuseExistingServer: false,
		timeout: 120_000,
		url: `${baseURL}/index.html`,
	},
};
