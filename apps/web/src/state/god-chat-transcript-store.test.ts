import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ChatTurn } from "./god-chat-model.ts";
import {
  appendCarryOver,
  clearTranscript,
  deserialize,
  loadTranscript,
  saveTranscript,
  serialize,
  transcriptStorageKey,
  trimToBudget,
} from "./god-chat-transcript-store.ts";

/** Build a minimal ChatTurn; `bodyChars` pads the text so size caps are testable. */
function turn(id: string, overrides: Partial<ChatTurn> = {}, bodyChars = 0): ChatTurn {
  return {
    id,
    role: "operator",
    text: "对天道下令".padEnd(Math.max(bodyChars, 1), "字"),
    ...overrides,
  };
}

/** Minimal in-memory `localStorage` stub mirroring the Web Storage contract. */
function installStorageStub(): { teardown: () => void } {
  const data = new Map<string, string>();
  const stub: Storage = {
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
  };
  (globalThis as { localStorage?: Storage }).localStorage = stub;
  return {
    teardown: () => {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    },
  };
}

describe("god-chat transcript persistence", () => {
  let storage: { teardown: () => void };

  beforeEach(() => {
    storage = installStorageStub();
  });

  afterEach(() => {
    storage.teardown();
  });

  test("round-trips a transcript through save/load (survives a simulated reload)", () => {
    const transcript: ChatTurn[] = [
      turn("t1", { role: "operator", text: "创建一个修真世界" }),
      turn("t2", { role: "system", text: "已创建" }),
      turn("t3", {
        card: { detail: "云遥", kind: "config", title: "创建角色", variant: "preview" },
        role: "system",
        text: "预览",
      }),
    ];
    saveTranscript("cultivation", "owner", transcript);

    // Simulate reload: the in-memory turns are gone, restore from storage.
    const restored = loadTranscript("cultivation", "owner");
    expect(restored).toEqual(transcript);
  });

  test("isolates scopes by (world, identity) — no cross-leak", () => {
    saveTranscript("cultivation", "owner", [turn("a", { text: "修真世界指令" })]);
    saveTranscript("debate", "owner", [turn("b", { text: "辩论世界指令" })]);
    saveTranscript("cultivation", "leijun", [turn("c", { text: "雷军视角指令" })]);

    expect(loadTranscript("cultivation", "owner")[0]?.text).toBe("修真世界指令");
    expect(loadTranscript("debate", "owner")[0]?.text).toBe("辩论世界指令");
    expect(loadTranscript("cultivation", "leijun")[0]?.text).toBe("雷军视角指令");

    // A scope with no persisted history loads empty, never a sibling's.
    expect(loadTranscript("debate", "leijun")).toEqual([]);
  });

  test("keys differ across world and identity, and fold a missing world stably", () => {
    expect(transcriptStorageKey("w1", "owner")).not.toBe(transcriptStorageKey("w2", "owner"));
    expect(transcriptStorageKey("w1", "owner")).not.toBe(transcriptStorageKey("w1", "leijun"));
    expect(transcriptStorageKey(undefined, "owner")).toBe(transcriptStorageKey(undefined, "owner"));
    expect(transcriptStorageKey(undefined, "owner")).toContain("__none__");
  });

  test("trims oldest-first to the size budget, keeping the newest turns", () => {
    // ~50KB per turn → well over the 256KB cap once there are many.
    const fat = Array.from({ length: 20 }, (_, i) => turn(`t${i}`, {}, 50_000));
    saveTranscript("cultivation", "owner", fat);

    const restored = loadTranscript("cultivation", "owner");
    // Some oldest turns were dropped to fit the budget...
    expect(restored.length).toBeLessThan(fat.length);
    expect(restored.length).toBeGreaterThan(0);
    // ...and the survivors are the NEWEST ones (the tail), in order.
    const lastRestored = restored.at(-1);
    expect(lastRestored?.id).toBe("t19");
    // Contiguous tail: ids stay monotonic from the first survivor to the last.
    const firstIdx = Number(restored[0]?.id.slice(1));
    expect(restored.map((entry) => entry.id)).toEqual(
      Array.from({ length: restored.length }, (_, i) => `t${firstIdx + i}`),
    );
  });

  test("pure trimToBudget keeps a small transcript untouched (same reference)", () => {
    const small = [turn("a"), turn("b")];
    expect(trimToBudget(small)).toBe(small);
  });

  test("saving an empty transcript clears the persisted slot", () => {
    saveTranscript("cultivation", "owner", [turn("a")]);
    expect(loadTranscript("cultivation", "owner")).toHaveLength(1);

    saveTranscript("cultivation", "owner", []);
    expect(loadTranscript("cultivation", "owner")).toEqual([]);
  });

  test("clearTranscript removes a scope's history", () => {
    saveTranscript("cultivation", "owner", [turn("a")]);
    clearTranscript("cultivation", "owner");
    expect(loadTranscript("cultivation", "owner")).toEqual([]);
  });

  test("appendCarryOver splices carry-over turns onto the destination's restored tail", () => {
    // F2 world-switch continuity: the destination's saved history stays on top, the
    // carried operator bubble + result card land on the bottom (one conversation).
    const restored = [turn("d1", { text: "目的地的旧历史" })];
    const carry = [
      turn("c1", { role: "operator", text: "切换到赛博修真世界" }),
      turn("c2", {
        card: { detail: "已更新", kind: "run-turn", title: "切换世界", variant: "result" },
        role: "system",
        text: "已切换",
      }),
    ];
    const merged = appendCarryOver(restored, carry);
    expect(merged.map((entry) => entry.id)).toEqual(["d1", "c1", "c2"]);
    expect(merged.at(-1)?.text).toBe("已切换");
    expect(merged[1]?.text).toBe("切换到赛博修真世界");
  });

  test("appendCarryOver dedupes by id so a carry-over already present is never doubled", () => {
    const restored = [turn("d1"), turn("c1", { text: "切换到赛博修真世界" })];
    const carry = [turn("c1", { text: "切换到赛博修真世界" })];
    // c1 already in base → no change, no duplicate.
    expect(appendCarryOver(restored, carry)).toBe(restored);
    expect(appendCarryOver(restored, [])).toBe(restored);
  });

  test("appendCarryOver keeps the result under budget, dropping oldest history first", () => {
    // A fat destination history + carry-over together exceed the 256KB cap; trimming
    // drops the oldest destination turns but ALWAYS keeps the carry-over (newest).
    const restored = Array.from({ length: 20 }, (_, i) => turn(`d${i}`, {}, 50_000));
    const carry = [turn("c-live", { role: "operator", text: "切换到赛博修真世界" })];
    const merged = appendCarryOver(restored, carry);
    expect(merged.length).toBeLessThan(restored.length + carry.length);
    // The live carry-over survives the trim (it is the newest turn).
    expect(merged.at(-1)?.id).toBe("c-live");
    expect(merged.at(-1)?.text).toBe("切换到赛博修真世界");
  });

  test("deserialize degrades to empty on corrupt / wrong-version / absent input", () => {
    expect(deserialize(null)).toEqual([]);
    expect(deserialize(undefined)).toEqual([]);
    expect(deserialize("not json {")).toEqual([]);
    expect(deserialize(JSON.stringify({ turns: [turn("a")], v: 999 }))).toEqual([]);
    expect(deserialize(JSON.stringify({ turns: "not-an-array", v: 1 }))).toEqual([]);
    // A well-formed current-version envelope still round-trips.
    expect(deserialize(serialize([turn("a")]))).toHaveLength(1);
  });
});

describe("god-chat transcript persistence without storage (SSR / private mode)", () => {
  test("load returns empty and save/clear no-op when localStorage is absent", () => {
    // No stub installed → `typeof localStorage === "undefined"` in this realm.
    expect(loadTranscript("cultivation", "owner")).toEqual([]);
    // These must not throw.
    expect(() => saveTranscript("cultivation", "owner", [turn("a")])).not.toThrow();
    expect(() => clearTranscript("cultivation", "owner")).not.toThrow();
  });

  test("load degrades to empty when localStorage.getItem throws", () => {
    const throwingStub = {
      getItem: () => {
        throw new Error("SecurityError: storage disabled");
      },
    } as unknown as Storage;
    (globalThis as { localStorage?: Storage }).localStorage = throwingStub;
    try {
      expect(loadTranscript("cultivation", "owner")).toEqual([]);
    } finally {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });
});
