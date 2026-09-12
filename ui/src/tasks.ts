export interface PullTask {
	checked: boolean;
	text: string;
	url?: string;
}

const TASK_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+\[([ xX])\]\s+(.+?)\s*$/;
const URL_PATTERN = /https?:\/\/[^\s>)]+/;

export function parsePullTasks(body: string): PullTask[] {
	const tasks: PullTask[] = [];
	let inFence = false;
	for (const line of body.split("\n")) {
		if (line.trimStart().startsWith("```")) {
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			continue;
		}
		const match = line.match(TASK_PATTERN);
		if (!match) {
			continue;
		}
		const text = match[2] ?? "";
		const url = text.match(URL_PATTERN)?.[0];
		tasks.push({
			checked: match[1]?.toLowerCase() === "x",
			text,
			...(url ? { url } : {}),
		});
	}
	return tasks;
}
