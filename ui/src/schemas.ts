import { z } from "zod";
import { githubDataRecordSchema } from "../../sidecar/src/data-values.ts";

/** Validate complete renderer records while retaining publisher objects and extras. */
function published<T>(contract: z.ZodType<T>) {
	return z.custom<T>(
		(cause) =>
			githubDataRecordSchema.safeParse(cause).success &&
			contract.safeParse(cause).success
	);
}

export const actorSchema = z.object({
	avatarUrl: z.string().nullable().optional(),
	login: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
});
const author = actorSchema.nullable().optional();
export const repositorySchema = z.object({ nameWithOwner: z.string() });
export const labelSchema = z.object({
	color: z.string().optional(),
	name: z.string(),
});
const summary = {
	author,
	commentsCount: z.number(),
	createdAt: z.string(),
	labels: z.array(labelSchema),
	number: z.number(),
	repository: repositorySchema,
	state: z.string(),
	title: z.string(),
	updatedAt: z.string(),
	url: z.string(),
};
const pullSummary = z.object({
	...summary,
	isDraft: z.boolean(),
	mergedAt: z.string().nullable().optional(),
});
const issueSummary = z.object({
	...summary,
	closedAt: z.string().nullable().optional(),
});
export const pullSummarySchema = published(pullSummary);
export const issueSummarySchema = published(issueSummary);
export const pullFileSchema = z.object({
	additions: z.number(),
	deletions: z.number(),
	path: z.string(),
});
export const pullCommentSchema = z.object({
	author,
	body: z.string(),
	createdAt: z.string(),
	url: z.string().optional(),
});
export const pullReviewSchema = z.object({
	author,
	body: z.string().nullable().optional(),
	state: z.string(),
	submittedAt: z.string().nullable().optional(),
});
export const pullIssueReferenceSchema = z.object({
	number: z.number(),
	repository: repositorySchema.optional(),
	state: z.string().optional(),
	title: z.string().optional(),
	url: z.string().optional(),
});
export const pullStackEntrySchema = z.object({
	author,
	baseRefName: z.string().optional(),
	headRefName: z.string().optional(),
	headRefOid: z.string().optional(),
	isDraft: z.boolean(),
	mergedAt: z.string().nullable().optional(),
	number: z.number(),
	state: z.string(),
	title: z.string().optional(),
	url: z.string().optional(),
});
export const pullStackSchema = published(
	z.object({
		baseRefName: z.string(),
		createdAt: z.string().optional(),
		number: z.number(),
		open: z.boolean(),
		pullRequests: z.array(pullStackEntrySchema),
		url: z.string().optional(),
	})
);
export const pullSubIssueSchema = z.object({
	number: z.number(),
	repository: z.object({ nameWithOwner: z.string().optional() }).optional(),
	state: z.string(),
	title: z.string(),
	url: z.string().optional(),
});
export const pullCheckSchema = z.object({
	bucket: z.string().nullable().optional(),
	conclusion: z.string().nullable().optional(),
	detailsUrl: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
	state: z.string().nullable().optional(),
	status: z.string().nullable().optional(),
	workflowName: z.string().nullable().optional(),
});
export const pullDetailSchema = published(
	pullSummary.extend({
		additions: z.number(),
		assignees: z.array(actorSchema),
		baseRefName: z.string(),
		body: z.string(),
		changedFiles: z.number(),
		closingIssuesReferences: z.array(pullIssueReferenceSchema),
		comments: z.array(pullCommentSchema),
		deletions: z.number(),
		files: z.array(pullFileSchema),
		headRefName: z.string(),
		latestReviews: z.array(pullReviewSchema),
		mergeable: z.string(),
		mergeStateStatus: z.string(),
		reviewDecision: z.string(),
		reviewRequests: z.array(z.object({ requestedReviewer: author })),
		stack: pullStackSchema.nullable(),
		statusCheckRollup: z.array(pullCheckSchema),
		subIssues: z.array(pullSubIssueSchema),
	})
);
export const issueDetailSchema = published(
	issueSummary.extend({
		assignees: z.array(actorSchema),
		body: z.string(),
		comments: z.array(pullCommentSchema),
	})
);
export const providerStatusSchema = published(
	z.object({
		available: z.boolean(),
		provider: z.string(),
		version: z.string(),
		viewer: actorSchema,
	})
);
export const deviceAuthStatusSchema = published(
	z.object({
		expiresAt: z.string(),
		id: z.string(),
		message: z.string().optional(),
		startedAt: z.string(),
		state: z.enum(["starting", "pending", "success", "error", "cancelled"]),
		userCode: z.string().optional(),
		verificationUri: z.string().optional(),
	})
);
export const mergeResultSchema = published(
	z.object({
		details: z
			.object({
				message: z.string().nullable().optional(),
				status: z.string().nullable().optional(),
				uuid: z.string().nullable().optional(),
			})
			.optional(),
		status: z.string().nullable().optional(),
	})
);
export const mutationResultSchema = published(
	z.object({
		ok: z.boolean(),
		result: mergeResultSchema.optional(),
		stack: pullStackSchema.nullable().optional(),
	})
);
export const okResponseSchema = published(z.object({ ok: z.boolean() }));
export const diffResponseSchema = published(
	z.object({ patch: z.string(), truncated: z.boolean() })
);
export const pullListResponseSchema = published(
	z.object({ pulls: z.array(pullSummarySchema) })
);
export const issueListResponseSchema = published(
	z.object({ issues: z.array(issueSummarySchema) })
);
export const authResponseSchema = published(
	z.object({ auth: deviceAuthStatusSchema.nullable() })
);
export const activeAuthResponseSchema = published(
	z.object({ auth: deviceAuthStatusSchema })
);
export const reviewModeSchema = z.enum([
	"comment",
	"approve",
	"request_changes",
]);
