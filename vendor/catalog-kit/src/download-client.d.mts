import type { ArtifactRecord } from './types';
export interface DownloadTicket { url: string; expiresAt: string; artifact: ArtifactRecord }
export function requestDownload(options: {
  api: string; key: string; revisionId: string; idempotencyKey: string;
  signal?: AbortSignal; fetchImpl?: typeof fetch;
  wait?: (ms: number, signal?: AbortSignal) => Promise<unknown>; maxPolls?: number;
}): Promise<DownloadTicket>;
