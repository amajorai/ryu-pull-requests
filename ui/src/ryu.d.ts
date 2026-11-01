import type {
	GitHubDataRecord,
	GitHubDataValue,
} from "../../sidecar/src/data-values.ts";

export interface AppRequestInput {
	body?: GitHubDataValue;
	method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
	path: string;
}

export interface RyuBridge {
	app: { request(input: AppRequestInput): Promise<GitHubDataValue> };
	context: GitHubDataRecord | null;
	model?: {
		complete(input: { prompt: string; system?: string }): Promise<string>;
	};
	shell?: {
		subscribeTheme?(options: {
			onChange(tokens: Record<string, string>): void;
		}): { dispose(): void };
	};
	ui?: { openExternal?(input: { url: string }): Promise<void> };
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
