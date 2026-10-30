import { z } from "zod";

/** Native GitHub JSON plus absent fields in sidecar response objects. */
export type GitHubDataValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| GitHubDataValue[]
	| GitHubDataRecord;
export interface GitHubDataRecord {
	[key: string]: GitHubDataValue;
}

const scalarSchema = z.union([
	z.string(),
	z.number(),
	z.literal(Number.POSITIVE_INFINITY),
	z.literal(Number.NEGATIVE_INFINITY),
	z.boolean(),
	z.null(),
	z.undefined(),
]);
const objectContainerSchema = z.object({});

function isNativeData(cause: unknown): boolean {
	const active = new Set<object>();
	const pending: (
		| { kind: "value"; cause: unknown }
		| { kind: "leave"; value: object }
	)[] = [{ kind: "value", cause }];
	while (pending.length > 0) {
		const next = pending.pop();
		if (!next) {
			break;
		}
		if (next.kind === "leave") {
			active.delete(next.value);
			continue;
		}
		if (scalarSchema.safeParse(next.cause).success) {
			continue;
		}
		const array = Array.isArray(next.cause);
		const record = objectContainerSchema.safeParse(next.cause);
		if (!(array || record.success)) {
			return false;
		}
		// SAFETY: Array.isArray or the object schema established an object;
		// inspect own descriptors without cloning or invoking JSON field getters.
		const object = next.cause as object;
		const prototype = Object.getPrototypeOf(object);
		if (!array && prototype !== Object.prototype && prototype !== null) {
			return false;
		}
		if (active.has(object)) {
			return false;
		}
		active.add(object);
		pending.push({ kind: "leave", value: object });
		for (const key of Object.keys(object)) {
			const descriptor = Object.getOwnPropertyDescriptor(object, key);
			if (!(descriptor && "value" in descriptor)) {
				return false;
			}
			pending.push({ kind: "value", cause: descriptor.value });
		}
	}
	return true;
}

/** Iterative validation retains native exponent overflow and deep JSON identity. */
export const githubDataValueSchema = z.custom<GitHubDataValue>(isNativeData);
export const githubDataRecordSchema = z.custom<GitHubDataRecord>(
	(cause) =>
		objectContainerSchema.safeParse(cause).success && isNativeData(cause)
);
export const githubDataArraySchema = z.custom<GitHubDataValue[]>(
	(cause) => Array.isArray(cause) && isNativeData(cause)
);
