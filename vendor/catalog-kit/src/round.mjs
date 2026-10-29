import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

export function memoryCheckpoint() {
  let value;
  return { load: async () => structuredClone(value), save: async (next) => { value = structuredClone(next); } };
}

export function fileCheckpoint(filename) {
  return {
    async load() {
      try { return JSON.parse(await readFile(filename, "utf8")); }
      catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
    },
    async save(value) {
      await mkdir(path.dirname(filename), { recursive: true });
      const temporary = `${filename}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value)}\n`);
      await rename(temporary, filename);
    },
  };
}

/** Resume a collection round without re-fetching already completed repositories.
 * Membership must come from a complete, fresh topic/seed reconciliation on EVERY
 * invocation. API failures leave completed work durable, but never return a partial
 * catalog. A completed round is retained until the caller publishes its result and
 * invokes acknowledge(), so a failed build can retry without starting from zero.
 */
export async function collectRound({ names, config, collect, finalize, checkpoint = memoryCheckpoint(), now = () => new Date().toISOString() }) {
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string" && /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(name))) throw new Error("Invalid collection membership");
  const membership = [...new Set(names.map((name) => name.toLowerCase()))].sort();
  const configHash = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  let state = await checkpoint.load();
  if (!state || state.configHash !== configHash || state.acknowledged) {
    state = { schemaVersion: 1, configHash, startedAt: now(), acknowledged: false, completedAt: null, membership: [], results: {} };
  } else if (state.schemaVersion !== 1 || !state.results || Array.isArray(state.results) || typeof state.results !== "object") {
    throw new Error("Invalid collection checkpoint; refusing to discard resumable state");
  }
  const valid = new Set(membership);
  for (const name of Object.keys(state.results)) if (!valid.has(name)) delete state.results[name];
  state.membership = membership;
  state.completedAt = null;
  await checkpoint.save(state);
  for (const name of membership) {
    if (Object.hasOwn(state.results, name)) continue;
    // A known unavailable/removed repository is a completed null result; HTTP
    // failure must throw, not be converted into that result by the adapter.
    const result = await collect(name);
    state.results[name] = result ?? null;
    await checkpoint.save(state);
  }
  if (membership.some((name) => !Object.hasOwn(state.results, name))) throw new Error("Incomplete collection round");
  const completedAt = now();
  const result = await finalize(membership.map((name) => state.results[name]), { startedAt: state.startedAt, completedAt });
  state.completedAt = completedAt;
  await checkpoint.save(state);
  return {
    result,
    progress: { startedAt: state.startedAt, completedAt, repositories: membership.length },
    async acknowledge() {
      state.acknowledged = true;
      await checkpoint.save(state);
    },
  };
}
