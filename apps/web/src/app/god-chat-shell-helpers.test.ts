import { describe, expect, test } from "bun:test";
import { defaultGodChatShellStrings } from "./god-chat-shell.tsx";
import {
  buildSuggestions,
  deferAfterSheetClose,
  resolveLivePreviewTurnId,
  streamingDetailLength,
} from "./god-chat-shell-helpers.ts";

/**
 * Pure helper contract for the God-chat shell. The shell itself is assembled AI
 * Elements; the load-bearing decisions (empty-state chip scoping + the read/write
 * `kind` split, live-preview turn resolution, streaming auto-scroll signal, the
 * two-frame Sheet handoff order) are extracted as React-free functions so they are
 * deterministically testable without rendering. The read/write split is what lets
 * a read chip direct-send while a write chip prefills.
 */

const member = (displayName: string, id = displayName) => ({ displayName, id }) as never;

describe("buildSuggestions — read/write kind flows from the dict", () => {
  test("an EMPTY world keeps create-world (write) + create-role (write) + inspect (read)", () => {
    const chips = buildSuggestions([], defaultGodChatShellStrings);

    expect(chips).toHaveLength(3);
    // Create-world is a mutation → write (prefill, never auto-send).
    expect(chips[0]?.label).toBe("创建一个修真世界");
    expect(chips[0]?.kind).toBe("write");
    // Empty world → the generic create-role chip (also a write).
    expect(chips[1]?.label).toBe("加一个角色");
    expect(chips[1]?.kind).toBe("write");
    // Inspect is side-effect-free → read (direct-send, NL-first one-tap answer).
    expect(chips[2]?.label).toBe("现在世界什么状态？");
    expect(chips[2]?.kind).toBe("read");
  });

  test("a POPULATED world swaps the middle chip for a role-CONTROL chip that is WRITE", () => {
    const chips = buildSuggestions([member("顾辰风")], defaultGodChatShellStrings);

    expect(chips).toHaveLength(3);
    // The middle chip now names the real member and is a control mutation → write.
    expect(chips[1]?.label).toContain("顾辰风");
    expect(chips[1]?.prompt).toContain("顾辰风");
    expect(chips[1]?.kind).toBe("write");
    // The inspect chip stays read regardless of world population.
    expect(chips[2]?.kind).toBe("read");
  });

  test("ONLY the inspect chip is read — every other empty-state chip is write (no accidental auto-send)", () => {
    for (const roles of [[], [member("云遥")]]) {
      const chips = buildSuggestions(roles, defaultGodChatShellStrings);
      const reads = chips.filter((chip) => chip.kind === "read");
      // Exactly one read chip (inspect); the rest are write so a mutation chip can
      // never auto-send.
      expect(reads).toHaveLength(1);
      expect(reads[0]?.label).toBe("现在世界什么状态？");
    }
  });
});

describe("resolveLivePreviewTurnId", () => {
  test("returns the most recent preview turn matching the pending kind", () => {
    const turns = [
      { card: { kind: "config", variant: "preview" }, id: "a" },
      { card: { kind: "god", variant: "preview" }, id: "b" },
    ];
    expect(resolveLivePreviewTurnId(turns, "god")).toBe("b");
  });

  test("returns undefined when nothing is pending", () => {
    expect(
      resolveLivePreviewTurnId([{ card: { kind: "god", variant: "preview" }, id: "a" }], undefined),
    ).toBeUndefined();
  });
});

describe("streamingDetailLength", () => {
  test("sums the detail length of the last streaming role-speech turn", () => {
    const turns = [
      { card: { detail: "done", streaming: false, variant: "role-speech" } },
      { card: { detail: "我...", streaming: true, variant: "role-speech" } },
    ];
    expect(streamingDetailLength(turns)).toBe("我...".length);
  });

  test("returns 0 when no role bubble is streaming", () => {
    expect(streamingDetailLength([{ card: { variant: "result" } }])).toBe(0);
  });
});

describe("deferAfterSheetClose", () => {
  test("closes synchronously, then opens through the scheduler (close before open)", () => {
    const order: string[] = [];
    deferAfterSheetClose(
      () => order.push("close"),
      () => order.push("open"),
      (task) => {
        order.push("schedule");
        task();
      },
    );
    expect(order).toEqual(["close", "schedule", "open"]);
  });
});
