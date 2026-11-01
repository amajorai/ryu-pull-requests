export interface PullRequestLink {
	number: number;
	owner: string;
	repository: string;
}

const GITHUB_OWNER = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/iu;
const GITHUB_REPOSITORY = /^[a-z\d._-]+$/iu;

export function parsePullRequestLink(value: string): PullRequestLink | null {
	try {
		const url = new URL(value.trim());
		if (url.protocol !== "https:" || url.hostname !== "github.com") {
			return null;
		}

		const [owner, repository, resource, rawNumber] = url.pathname
			.split("/")
			.filter(Boolean);
		if (
			!(owner && repository) ||
			resource !== "pull" ||
			!rawNumber ||
			!GITHUB_OWNER.test(owner) ||
			!GITHUB_REPOSITORY.test(repository)
		) {
			return null;
		}

		const number = Number(rawNumber);
		if (!Number.isSafeInteger(number) || number < 1) {
			return null;
		}

		return { owner, repository, number };
	} catch {
		return null;
	}
}
