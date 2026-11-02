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
		const task: PullTask = {
			checked: match[1]?.toLowerCase() === "x",
			text,
		};
		if (url) {
			task.url = url;
		}
		tasks.push(task);
	}
	return tasks;
}

export function stripPullTasks(body: string): string {
	const lines: string[] = [];
	let inFence = false;
	for (const line of body.split("\n")) {
		if (line.trimStart().startsWith("```")) {
			inFence = !inFence;
			lines.push(line);
			continue;
		}
		if (inFence || !TASK_PATTERN.test(line)) {
			lines.push(line);
			continue;
		}

		let previousContentIndex = lines.length - 1;
		while (previousContentIndex >= 0 && !lines[previousContentIndex]?.trim()) {
			previousContentIndex -= 1;
		}
		if (/^#{1,6}\s/u.test(lines[previousContentIndex]?.trim() ?? "")) {
			lines.splice(previousContentIndex);
		}
	}
	return lines
		.join("\n")
		.replace(/\n{3,}/gu, "\n\n")
		.trim();
}
