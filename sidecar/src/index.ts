import { GitHubDeviceAuth } from "./auth.ts";
import { createServer } from "./server.ts";

const auth = new GitHubDeviceAuth();
const server = createServer({ auth });
const shutdown = () => {
	auth.cancel();
	server.stop(true);
	process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
// biome-ignore lint/suspicious/noConsole: sidecar lifecycle diagnostic goes to stderr/stdout.
console.log(
	`[ryu-pull-requests] listening on ${server.hostname}:${server.port}`
);
