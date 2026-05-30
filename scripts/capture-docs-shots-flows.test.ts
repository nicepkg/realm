import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveCapturePlan } from "./capture-docs-shots-flows.ts";

const REPO = "/repo";
const ENV_KEYS = [
  "REALM_CAPTURE_PRESET",
  "REALM_CAPTURE_EXAMPLE",
  "REALM_CAPTURE_WORLD",
  "REALM_CAPTURE_PREFIX",
] as const;

describe("resolveCapturePlan", () => {
  // resolveCapturePlan reads --flags from argv AND env. The tests drive it via env
  // (argv is shared global state for the whole bun run); clear all of them around
  // each case so presets resolve deterministically.
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("defaults to cultivation-sim with bare docs-bound shot names", () => {
    const { preset, prefix } = resolveCapturePlan(REPO);
    expect(preset.id).toBe("cultivation");
    expect(preset.worldId).toBe("cultivation");
    expect(preset.exampleDir).toBe(path.resolve(REPO, "examples", "cultivation-sim"));
    // The docs default must keep bare "<shot>-<viewport>.png" so FlowShowcase finds them.
    expect(prefix).toBe("");
    expect(preset.flows.map((flow) => flow.shot)).toEqual([
      "create-world",
      "set-rule",
      "add-role",
      "run-turn",
      "god-action",
      "state-inspect",
    ]);
  });

  test("boardroom preset targets the 商战 example and prefixes shots to avoid collision", () => {
    process.env.REALM_CAPTURE_PRESET = "boardroom";
    const { preset, prefix } = resolveCapturePlan(REPO);
    expect(preset.id).toBe("boardroom");
    expect(preset.worldId).toBe("boardroom");
    expect(preset.exampleDir).toBe(path.resolve(REPO, "examples", "boardroom-saga"));
    // A non-default preset never overwrites the canonical docs shots.
    expect(prefix).toBe("boardroom-");
  });

  test("boardroom shot ids reuse the docs base ids so evidence is comparable", () => {
    process.env.REALM_CAPTURE_PRESET = "boardroom";
    const { preset } = resolveCapturePlan(REPO);
    expect(preset.flows.map((flow) => flow.shot)).toEqual([
      "create-world",
      "set-rule",
      "add-role",
      "run-turn",
      "god-action",
      "state-inspect",
    ]);
  });

  test("boardroom utterances are tuned to the 商战 roles and rules", () => {
    process.env.REALM_CAPTURE_PRESET = "boardroom";
    const { preset } = resolveCapturePlan(REPO);
    const byShot = Object.fromEntries(preset.flows.map((flow) => [flow.shot, flow.utterance]));
    expect(byShot["add-role"]).toContain("周野");
    expect(byShot["run-turn"]).toContain("陈牧");
    expect(byShot["god-action"]).toContain("林晚");
    expect(byShot["state-inspect"]).toContain("董事会");
  });

  test("create-world is the only preview-only flow and inspect is the only read", () => {
    process.env.REALM_CAPTURE_PRESET = "boardroom";
    const { preset } = resolveCapturePlan(REPO);
    const previewOnly = preset.flows.filter((flow) => flow.previewOnly).map((flow) => flow.shot);
    const reads = preset.flows.filter((flow) => !flow.confirm).map((flow) => flow.shot);
    expect(previewOnly).toEqual(["create-world"]);
    expect(reads).toEqual(["state-inspect"]);
  });

  test("explicit --example override keeps the preset's flows but repoints the dir", () => {
    process.env.REALM_CAPTURE_EXAMPLE = "examples/custom";
    process.env.REALM_CAPTURE_WORLD = "custom-world";
    const { preset, prefix } = resolveCapturePlan(REPO);
    expect(preset.exampleDir).toBe(path.resolve(REPO, "examples", "custom"));
    expect(preset.worldId).toBe("custom-world");
    // An overridden example is not the docs default, so it gets a collision-proof prefix.
    expect(prefix).toBe("cultivation-");
  });

  test("explicit prefix wins over the derived one", () => {
    process.env.REALM_CAPTURE_PRESET = "boardroom";
    process.env.REALM_CAPTURE_PREFIX = "demo-";
    const { prefix } = resolveCapturePlan(REPO);
    expect(prefix).toBe("demo-");
  });

  test("an unknown preset fails loudly with the known list", () => {
    process.env.REALM_CAPTURE_PRESET = "nope";
    expect(() => resolveCapturePlan(REPO)).toThrow(/Unknown --preset "nope"/);
  });
});
