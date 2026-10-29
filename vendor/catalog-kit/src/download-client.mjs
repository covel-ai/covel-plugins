/** Pending preparation never issues a ticket or increments downloadRequests.
 * Reuse the same request key across polling/retry, and abort on detail changes. */
export async function requestDownload({ api, key, revisionId, idempotencyKey, signal, fetchImpl = fetch, wait = (ms, signal) => new Promise((resolve, reject) => {
  const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
  const timer = setTimeout(done, ms);
  const abort = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); };
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
}), maxPolls = 240 }) {
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const response = await fetchImpl(`${api}/v1/downloads`, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, revisionId, idempotencyKey }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? `Download request failed (${response.status})`);
    if (response.status !== 202) {
      if (!data?.url || !data?.artifact?.artifactSha256) throw new Error('Invalid download ticket');
      const url = new URL(data.url);
      if (url.origin !== new URL(api).origin || !url.pathname.startsWith('/v1/files/')) throw new Error('Invalid download origin');
      return data;
    }
    if (data?.state !== 'pending' || typeof data.jobId !== 'string') throw new Error('Invalid pending download');
    await wait(Math.max(1000, Math.min(30000, Number(data.retryAfter ?? 15) * 1000)), signal);
  }
  throw new Error('ZIP preparation is still pending. Retry to resume the same request.');
}
