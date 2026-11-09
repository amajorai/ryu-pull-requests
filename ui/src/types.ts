import type { z } from "zod";
import type * as owners from "./schemas.ts";

export type Actor = z.infer<typeof owners.actorSchema>;
export type Repository = z.infer<typeof owners.repositorySchema>;
export type Label = z.infer<typeof owners.labelSchema>;
export type PullSummary = z.infer<typeof owners.pullSummarySchema>;
export type PullFile = z.infer<typeof owners.pullFileSchema>;
export type PullComment = z.infer<typeof owners.pullCommentSchema>;
export type PullReview = z.infer<typeof owners.pullReviewSchema>;
export type PullIssueReference = z.infer<
	typeof owners.pullIssueReferenceSchema
>;
export type PullStackEntry = z.infer<typeof owners.pullStackEntrySchema>;
export type PullStack = z.infer<typeof owners.pullStackSchema>;
export type PullSubIssue = z.infer<typeof owners.pullSubIssueSchema>;
export type IssueSummary = z.infer<typeof owners.issueSummarySchema>;
export type IssueDetail = z.infer<typeof owners.issueDetailSchema>;
export type PullCheck = z.infer<typeof owners.pullCheckSchema>;
export type PullDetail = z.infer<typeof owners.pullDetailSchema>;
export type ProviderStatus = z.infer<typeof owners.providerStatusSchema>;
export type DeviceAuthStatus = z.infer<typeof owners.deviceAuthStatusSchema>;
export type IssueComment = PullComment;
