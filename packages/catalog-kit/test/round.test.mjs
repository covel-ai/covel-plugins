import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectRound, memoryCheckpoint, fileCheckpoint } from "../src/round.mjs";
import { GitHubError } from "../src/github.mjs";

test("a queue larger than the API budget advances across two independent processes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "covel-round-"));
  try {
    const filename = path.join(dir, "round.json");
    const names = ["a/one", "a/two", "a/three", "a/four"];
    const visited = [];
    let budget = 2;
    let finalized = 0;
    const collect = async (name) => {
      if (!budget--) throw new GitHubError("budget exhausted", 429);
      visited.push(name);
      return { name };
    };
    const finalize = async (results) => { finalized++; return results; };
    await assert.rejects(collectRound({ names, config: { kind: "worlds" }, collect, finalize, checkpoint: fileCheckpoint(filename) }), /budget exhausted/);
    assert.equal(finalized, 0);
    budget = 2;
    // New checkpoint instance simulates a fresh runner with no JS memory state.
    const resumed = await collectRound({ names, config: { kind: "worlds" }, collect, finalize, checkpoint: fileCheckpoint(filename) });
    assert.equal(resumed.result.length, 4);
    assert.equal(finalized, 1);
    assert.deepEqual([...visited].sort(), [...names].sort());
    assert.equal(visited.length, 4);
    await resumed.acknowledge();
    assert.equal((await fileCheckpoint(filename).load()).acknowledged, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fresh membership removes vanished repos and adds new ones during a resumed round", async () => {
  const checkpoint = memoryCheckpoint();
  await assert.rejects(collectRound({ names: ["a/one", "a/two"], config: {}, checkpoint, collect: async (name) => {
    if (name === "a/two") throw new Error("network failed");
    return name;
  }, finalize: () => { throw new Error("must not finalize"); } }), /network failed/);
  const result = await collectRound({ names: ["a/two", "a/new"], config: {}, checkpoint, collect: async (name) => name, finalize: (rows) => rows });
  assert.deepEqual(result.result, ["a/new", "a/two"]);
  assert.equal(Object.hasOwn((await checkpoint.load()).results, "a/one"), false);
});

test("failure while publishing can replay a complete checkpoint; acknowledgement starts a new round", async () => {
  const checkpoint = memoryCheckpoint();
  let calls = 0;
  const options = { names: ["a/one"], config: {}, checkpoint, collect: async () => ++calls, finalize: (rows) => rows };
  const first = await collectRound(options);
  assert.deepEqual(first.result, [1]);
  const replay = await collectRound(options);
  assert.deepEqual(replay.result, [1]);
  assert.equal(calls, 1);
  await replay.acknowledge();
  assert.deepEqual((await collectRound(options)).result, [2]);
});

test("config changes invalidate old work; unavailable repositories are completed nulls", async () => {
  const checkpoint = memoryCheckpoint();
  const common = { names: ["a/one"], checkpoint, finalize: (rows) => rows };
  await collectRound({ ...common, config: { official: true }, collect: async () => ({ official: true }) });
  const result = await collectRound({ ...common, config: { official: false }, collect: async () => null });
  assert.deepEqual(result.result, [null]);
});
