import { z } from "zod";
import {
	type GitHubDataRecord,
	githubDataRecordSchema,
	githubDataValueSchema,
} from "./data-values.ts";

function nativeRecord<T extends GitHubDataRecord>(contract: z.ZodType<T>) {
	return z.custom<T>(
		(cause) =>
			githubDataRecordSchema.safeParse(cause).success &&
			contract.safeParse(cause).success
	);
}

const text = z.string().nullable().optional();
const count = z.number().optional();

export const githubActorSchema = nativeRecord(
	z
		.object({
			avatarUrl: text,
			avatar_url: text,
			login: text,
			name: text,
		})
		.catchall(githubDataValueSchema)
);
const actor = githubActorSchema.nullable().optional();
const repository = nativeRecord(
	z
		.object({
			nameWithOwner: text,
			full_name: text,
		})
		.catchall(githubDataValueSchema)
)
	.nullable()
	.optional();
const comment = nativeRecord(
	z
		.object({
			author: actor,
			body: text,
			createdAt: text,
			url: text,
		})
		.catchall(githubDataValueSchema)
);
const review = nativeRecord(
	z
		.object({
			author: actor,
			body: text,
			state: text,
			submittedAt: text,
		})
		.catchall(githubDataValueSchema)
);
const label = nativeRecord(
	z
		.object({
			color: text,
			name: text,
		})
		.catchall(githubDataValueSchema)
);
const commit = nativeRecord(
	z
		.object({
			authoredDate: text,
			authors: z.array(githubActorSchema).nullable().optional(),
			committedDate: text,
			messageBody: text,
			messageHeadline: text,
			oid: text,
		})
		.catchall(githubDataValueSchema)
);
const file = nativeRecord(
	z
		.object({
			additions: count,
			deletions: count,
			path: text,
		})
		.catchall(githubDataValueSchema)
);
const check = nativeRecord(
	z
		.object({
			bucket: text,
			conclusion: text,
			detailsUrl: text,
			name: text,
			state: text,
			status: text,
			workflowName: text,
		})
		.catchall(githubDataValueSchema)
);
const issueReference = nativeRecord(
	z
		.object({
			number: count,
			repository,
			state: text,
			title: text,
			url: text,
		})
		.catchall(githubDataValueSchema)
);
const reviewRequest = nativeRecord(
	z
		.object({
			requestedReviewer: actor,
		})
		.catchall(githubDataValueSchema)
);

/** The CLI's projection records can be partial on legacy installations. */
export const githubPullRecordSchema = nativeRecord(
	z
		.object({
			additions: count,
			assignees: z.array(githubActorSchema).nullable().optional(),
			author: actor,
			baseRefName: text,
			body: text,
			changedFiles: count,
			closingIssuesReferences: z.array(issueReference).nullable().optional(),
			closedAt: text,
			comments: z.array(comment).nullable().optional(),
			commentsCount: count,
			commits: z.array(commit).nullable().optional(),
			createdAt: text,
			deletions: count,
			files: z.array(file).nullable().optional(),
			headRefName: text,
			headRefOid: text,
			isDraft: z.boolean().optional(),
			labels: z.array(label).nullable().optional(),
			latestReviews: z.array(review).nullable().optional(),
			mergeStateStatus: text,
			mergeable: text,
			mergedAt: text,
			mergedBy: actor,
			number: count,
			repository,
			reviewDecision: text,
			reviewRequests: z.array(reviewRequest).nullable().optional(),
			state: text,
			statusCheckRollup: z.array(check).nullable().optional(),
			title: text,
			updatedAt: text,
			url: text,
		})
		.catchall(githubDataValueSchema)
);
export const githubPullRecordsSchema = z.array(githubPullRecordSchema);
export type GitHubPullRecord = z.infer<typeof githubPullRecordSchema>;

export const githubMergeResultSchema = nativeRecord(
	z
		.object({
			details: nativeRecord(
				z
					.object({
						message: text,
						status: text,
						uuid: text,
					})
					.catchall(githubDataValueSchema)
			).optional(),
			status: text,
		})
		.catchall(githubDataValueSchema)
).optional();
export type GitHubMergeResult = z.infer<typeof githubMergeResultSchema>;
export interface GitHubProviderStatus {
	available: boolean;
	provider: string;
	version: string;
	viewer: z.infer<typeof githubActorSchema>;
}
