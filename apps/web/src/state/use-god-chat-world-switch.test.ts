import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import { routeIntent } from "@/state/god-chat-model.ts";
import {
  appendCarryOver,
  loadTranscript,
  saveTranscript,
} from "@/state/god-chat-transcript-store.ts";
import { buildWorldSwitchCarryOver } from "@/state/use-god-chat-helpers.ts";
import { context } from "@/state/use-god-chat-test-fixtures.ts";

/**
 * God-chat world-switch contract (NO-NL-WORLD-SWITCH + F2 scope-swap continuity).
 * Split out of `use-god-chat.test.ts` to keep each file under the 500-line guard.
 * Covers: NL world-switch routing (never a silent inspect) and the per-world
 * transcript scope swap that must preserve the live operator bubble + result card.
 */

describe("routeIntent — world-switch (NO-NL-WORLD-SWITCH, never a silent inspect)", () => {
  const worlds = [
    { id: "cultivation", name: "云岭修仙界" },
    { id: "cyber", name: "赛博江湖" },
  ];

  test("'切换到云岭修仙界' from another active world routes to a resolved world-switch", () => {
    const route = routeIntent("切换到云岭修仙界", context({ worldId: "cyber", worlds }));
    expect(route.mode).toBe("world-switch");
    if (route.mode !== "world-switch") {
      throw new Error("expected world-switch");
    }
    expect(route.worldId).toBe("cultivation");
    expect(route.worldName).toBe("云岭修仙界");
  });

  test("switching INTO the already-active world is a calm no-op, not a redundant reload", () => {
    const route = routeIntent("切换到云岭修仙界", context({ worldId: "cultivation", worlds }));
    expect(route.mode).toBe("noop");
    if (route.mode !== "noop") {
      throw new Error("expected noop");
    }
    expect(route.text).toContain("已经在");
  });

  test("an unknown named world lists the available worlds, never inspects silently", () => {
    const route = routeIntent("切换到不存在的世界", context({ worlds }));
    expect(route.mode).toBe("noop");
    if (route.mode !== "noop") {
      throw new Error("expected noop");
    }
    // It must offer the real choices, not fall into a world-state read.
    expect(route.text).toContain("云岭修仙界");
    expect(route.text).toContain("赛博江湖");
  });

  test("a plain world-state question still inspects (read path intact)", () => {
    const route = routeIntent("现在世界什么状态？", context({ worlds }));
    expect(route.mode).toBe("inspect");
  });
});

/**
 * F2 — world-switch turn continuity across the per-world transcript scope swap.
 *
 * BUG: typing "切换到赛博修真世界" from the cultivation world pushed the live operator
 * bubble into the SOURCE scope; then `selectWorld` flipped `worldId` and the
 * persistence scope-switch effect REPLACED `turns` with the DESTINATION world's
 * previously-saved transcript (which held an OLDER switch turn "切换到云岭修仙界"). So
 * the operator's just-typed bubble + the switch result card were dropped and a stale
 * destination-scope bubble was shown.
 *
 * The repo has no DOM/renderHook infra, so this drives the EXACT sequence the hook
 * runs on a chat-initiated switch — `submit` stashes a carry-over from the LIVE text,
 * then the scope-switch effect body restores the destination transcript and splices
 * the carry-over on top via `appendCarryOver(loadTranscript(dest), build(carry))`.
 * We assert the post-switch operator bubble reads the typed text and the result card
 * is present, NOT the stale destination bubble.
 */
describe("F2 — typing a world-switch keeps the live bubble + result across the scope swap", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
      key: (index) => [...data.keys()][index] ?? null,
      removeItem: (key) => {
        data.delete(key);
      },
      setItem: (key, value) => {
        data.set(key, String(value));
      },
    } satisfies Storage;
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  /** Run the persistence scope-switch effect body for a chat-initiated switch. */
  function runScopeSwitch(destWorldId: string, liveText: string, worldName: string): ChatTurn[] {
    let seq = 0;
    const nextId = () => {
      seq += 1;
      return `live-${seq}`;
    };
    const restored = loadTranscript(destWorldId, "owner");
    const carry = buildWorldSwitchCarryOver({ liveText, worldName }, nextId);
    return appendCarryOver(restored, carry);
  }

  test("the post-switch operator bubble === the typed text, with the result card, not the destination's stale switch turn", () => {
    // The destination world (赛博修真世界 = "cyber") was last left holding an OLDER
    // switch turn: "切换到云岭修仙界". This is exactly what used to leak as the stale
    // bubble after the swap.
    saveTranscript("cyber", "owner", [
      { id: "stale-1", role: "operator", text: "切换到云岭修仙界" },
      {
        card: { detail: "已更新", kind: "run-turn", title: "切换世界", variant: "result" },
        id: "stale-2",
        role: "system",
        text: "已切换到「云岭修仙界」。",
      },
    ]);

    // Operator now types the LIVE switch from cultivation → cyber.
    const turns = runScopeSwitch("cyber", "切换到赛博修真世界", "赛博修真世界");

    // The live operator bubble is present and reads the verbatim typed text.
    const operatorBubbles = turns.filter((turn) => turn.role === "operator");
    const live = operatorBubbles.at(-1);
    expect(live?.text).toBe("切换到赛博修真世界");
    // It is NOT the stale destination-scope label.
    expect(live?.text).not.toBe("切换到云岭修仙界");

    // The switch result card landed right after it, naming the destination.
    const result = turns.at(-1);
    expect(result?.role).toBe("system");
    if (result?.card?.variant !== "result") {
      throw new Error("expected a result card after the live operator bubble");
    }
    expect(result.card.title).toBe("切换世界");
    expect(result.card.detail).toContain("赛博修真世界");

    // The destination's prior history is preserved ABOVE the carry-over (continuity),
    // never replacing or duplicating the live turns.
    expect(turns.map((turn) => turn.text)).toEqual([
      "切换到云岭修仙界",
      "已切换到「云岭修仙界」。",
      "切换到赛博修真世界",
      "已切换到「赛博修真世界」。",
    ]);
  });

  test("switching into a never-visited destination shows ONLY the live turns (no ghost history)", () => {
    const turns = runScopeSwitch("fresh-world", "切换到新世界", "新世界");
    expect(turns).toHaveLength(2);
    expect(turns[0]?.text).toBe("切换到新世界");
    expect(turns[1]?.card?.variant).toBe("result");
  });
});
