import { describe, expect, test } from "bun:test";
import {
  composeStructureFollowUp,
  resolveCreatedWorldId,
  shouldRestoreDraftOnProposalError,
} from "@/state/use-god-chat.ts";
import { operation, stagedWorld } from "@/state/use-god-chat-test-fixtures.ts";

/**
 * F2/F3/F5 — the load-bearing branch decisions inside `useGodChat` are extracted
 * as pure functions so they are unit-testable without a hook renderer (the repo
 * has no DOM/renderHook infra). We assert each contract here. The routing/answer
 * model is covered in `use-god-chat.test.ts`.
 */

describe("F5 — create-world always switches to the NEW world id", () => {
  test("resolves the created world id from the applied patch's manifest path", () => {
    const proposal = stagedWorld("创建一个修真世界", [
      operation("create", ".agents/worlds/assistant-world/world.yaml"),
      operation("create", ".agents/worlds/assistant-world/initial-state.yaml"),
    ]);
    expect(resolveCreatedWorldId(proposal)).toBe("assistant-world");
  });

  test("falls back to the typed world input id when the patch path can't be parsed (no stale old world)", () => {
    // The path-parse misses (a renamed/unexpected manifest layout), but the world
    // id is deterministic from the goal — so the rail still switches to the NEW
    // world instead of leaking the old world's stale roles. 修真世界 hashes to a
    // stable FNV-1a `world-<hash>` token (no kebab slug for a pure-CJK name).
    const proposal = stagedWorld("创建一个修真世界", [
      operation("create", "some/other/unparseable/path.yaml"),
    ]);
    expect(resolveCreatedWorldId(proposal)).toBe("world-ff3d9068");
  });

  test("a role/rule config that creates no world resolves to undefined (caller plain-reloads)", () => {
    const proposal = stagedWorld("加一个叫沈墨的剑修", [
      operation("create", ".agents/roles/shenmo.yaml"),
    ]);
    expect(resolveCreatedWorldId(proposal)).toBeUndefined();
  });
});

describe("F3 — trust-gate denial must NOT restore the draft (input stays cleared)", () => {
  test("a trust-related proposal failure keeps the composer cleared (goal already stashed)", () => {
    expect(shouldRestoreDraftOnProposalError(true)).toBe(false);
  });

  test("an unrecoverable proposal failure restores the draft as a retry buffer", () => {
    expect(shouldRestoreDraftOnProposalError(false)).toBe(true);
  });
});

describe("F2 — create-world with structure clues offers an honest follow-up", () => {
  test("a goal naming 宗门/对手/师父 yields a follow-up offer mentioning each", () => {
    const text = composeStructureFollowUp("创建一个有宗门对手师父的修真世界");
    expect(text).toBeDefined();
    expect(text).toContain("宗门");
    expect(text).toContain("对手");
    expect(text).toContain("师父");
    // It must be an honest offer to build them out, not a claim they exist.
    expect(text).toContain("要我把它们也建出来吗");
  });

  test("a bare themed world names no structure → no follow-up (the empty world IS the request)", () => {
    expect(composeStructureFollowUp("创建一个修真世界")).toBeUndefined();
    expect(composeStructureFollowUp("帮我建一个世界")).toBeUndefined();
  });
});
