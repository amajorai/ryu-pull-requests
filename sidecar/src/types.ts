export type PullScope = "all" | "authored" | "reviewing";
export type PullState = "closed" | "merged" | "open";

export interface PullKey {
	number: number;
	repo: string;
}

export interface GhRunner {
	run(args: string[], options?: { allowExitCodes?: number[] }): Promise<string>;
}
