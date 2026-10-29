import { z } from "zod";
import { fail } from "./core.mjs";
export const downloadSchema = z.object({ key: z.string().min(1).max(700), revisionId: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().min(16).max(200) }).strict();
const lockSchema = z.object({
  registryUrl: z.url(), entryKey: z.string().max(700), revisionId: z.string().regex(/^[a-f0-9]{64}$/), installedVersion: z.string().max(100).nullable(),
  commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/), contentHash: z.string().regex(/^[a-f0-9]{64}$/), hashScheme: z.string().max(100),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceRef: z.object({ type: z.enum(["branch", "tag", "commit"]), name: z.string().max(255) }).strict(),
  updatePolicy: z.enum(["pinned", "branch", "stable"]), installedAt: z.iso.datetime(), lastCheckedAt: z.iso.datetime().nullable(), previousRevisionId: z.string().nullable(),
}).strict();
export const updateSchema = z.object({ lock: lockSchema, hostVersion: z.string().max(100).optional(), locallyModified: z.boolean().optional(), contractsVerified: z.boolean().optional() }).strict();
export function rangeOf(range, size) {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) fail(416, "invalid_range", "Only one byte range is supported");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) fail(416, "invalid_range", "Range is outside the artifact");
  return { start, end };
}

