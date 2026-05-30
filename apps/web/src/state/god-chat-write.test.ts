import { describe, expect, mock, test } from "bun:test";
import type { ConfigPatchProposal } from "@realm/api-contract";
import type { RealmAppController } from "@/app/types.ts";
import type { ChatTurn, PendingProposal, StagedWrite } from "@/state/god-chat-model.ts";
import { extractCreatedWorldId, performWrite } from "@/state/god-chat-write.ts";

/**
 * God-chat WRITE contract. `performWrite` is the ONLY code path that issues a
 * backend write; `extractCreatedWorldId` decides whether a config apply created a
 * brand-new world (so the rail switches to it). We verify confirm dispatches to
 * the right EXISTING SDK method per family — and that a run-turn returns the
 * accepted turn handle instead of faking success.
 */

describe("performWrite — confirm dispatches to the EXISTING SDK method", () => {
  type CallCounts = {
    adminPatchState: number;
    applyConfigPatch: number;
    applyGodRoleAction: number;
    startRoleTurn: number;
  };

  function fakeApp(): { app: RealmAppController; calls: CallCounts } {
    const calls: CallCounts = {
      adminPatchState: 0,
      applyConfigPatch: 0,
      applyGodRoleAction: 0,
      startRoleTurn: 0,
    };
    const client = {
      adminPatchState: mock(async () => {
        calls.adminPatchState += 1;
        return { patch: {}, result: { status: "committed" } } as never;
      }),
      applyConfigPatch: mock(async () => {
        calls.applyConfigPatch += 1;
        return { changedPaths: ["config/roles.yaml"], historyId: "h1", patchId: "p1" } as never;
      }),
      applyGodRoleAction: mock(async () => {
        calls.applyGodRoleAction += 1;
        return { action: {}, patch: {}, result: { status: "committed" } } as never;
      }),
      startRoleTurn: mock(async () => {
        calls.startRoleTurn += 1;
        return { turnId: "t1" } as never;
      }),
    };
    return { app: { client } as unknown as RealmAppController, calls };
  }

  const godProposal: StagedWrite = {
    action: "mute",
    kind: "god",
    reason: "作弊",
    targetRoleId: "guchenfeng",
    targetRoleName: "顾辰风",
    worldId: "cultivation",
  };

  const statePatch: StagedWrite = {
    kind: "state-patch",
    operations: [{ op: "append", path: "/roles/guchenfeng/conditions", value: "断了一根肋骨" }],
    reason: "给顾辰风加上断了一根肋骨",
    worldId: "cultivation",
  };

  const runTurn: StagedWrite = {
    kind: "run-turn",
    roleId: "guchenfeng",
    roleName: "顾辰风",
    roomId: "main",
    worldId: "cultivation",
  };

  function collect(): { push: (turn: Omit<ChatTurn, "id">) => void; turns: ChatTurn[] } {
    const turns: ChatTurn[] = [];
    return { push: (turn) => turns.push({ ...turn, id: "x" }), turns };
  }

  test("god confirm calls applyGodRoleAction and reports the ruling", async () => {
    const { app, calls } = fakeApp();
    const sink = collect();
    await performWrite(app, godProposal, undefined, sink.push);
    expect(calls.applyGodRoleAction).toBe(1);
    expect(sink.turns.at(-1)?.text).toContain("顾辰风");
  });

  test("state-patch confirm calls adminPatchState", async () => {
    const { app, calls } = fakeApp();
    const sink = collect();
    await performWrite(app, statePatch, undefined, sink.push);
    expect(calls.adminPatchState).toBe(1);
    expect(sink.turns.at(-1)?.card?.variant).toBe("result");
  });

  test("run-turn confirm calls startRoleTurn and returns the accepted turn handle (F1, no fake success)", async () => {
    const { app, calls } = fakeApp();
    const sink = collect();
    const handle = await performWrite(app, runTurn, undefined, sink.push);
    expect(calls.startRoleTurn).toBe(1);
    // The handle carries the backend turn id so the hook can stream the reply
    // back into the conversation — instead of optimistically claiming success.
    expect(handle?.turnId).toBe("t1");
    expect(handle?.roleName).toBe("顾辰风");
    expect(handle?.proposal).toBe(runTurn);
    // The pushed feedback is an honest "回合进行中" status, not "已让X发言".
    expect(sink.turns.at(-1)?.text).toContain("正在等");
    expect(sink.turns.at(-1)?.text).not.toContain("已让");
  });

  test("config confirm calls applyConfigPatch with the typed confirmation", async () => {
    const { app, calls } = fakeApp();
    const sink = collect();
    const proposal: PendingProposal = {
      goal: "创建角色",
      kind: "config",
      proposal: {
        createdAt: new Date().toISOString(),
        id: "patch-1",
        operations: [
          {
            action: "create",
            nextContent: "x",
            nextHash: "h",
            path: "config/roles.yaml",
            previousHash: null,
          },
        ],
        requiredCapabilities: [],
        riskLevel: "low",
        riskReasons: [],
        summary: "新增一个角色",
        title: "新增角色",
        typedConfirmation: null,
      },
    };
    await performWrite(app, proposal, "CONFIRM", sink.push);
    expect(calls.applyConfigPatch).toBe(1);
    expect(app.client.applyConfigPatch).toHaveBeenCalledWith("patch-1", {
      confirmation: "CONFIRM",
    });
  });
});

/** Build a config file operation for the extractor tests (F4). */
function op(
  action: "create" | "update" | "delete",
  path: string,
): ConfigPatchProposal["operations"][number] {
  return {
    action,
    nextContent: action === "delete" ? null : "x",
    nextHash: "h",
    path,
    previousHash: null,
  };
}

describe("extractCreatedWorldId — switch the rail to a freshly created world (F4)", () => {
  test("returns the id segment of a created world manifest (world.yaml)", () => {
    expect(extractCreatedWorldId([op("create", ".agents/worlds/cyber-wuxia/world.yaml")])).toBe(
      "cyber-wuxia",
    );
  });

  test("also matches the .yml extension", () => {
    expect(extractCreatedWorldId([op("create", ".agents/worlds/sandbox-1/world.yml")])).toBe(
      "sandbox-1",
    );
  });

  test("picks the created world out of a mixed multi-file patch", () => {
    const id = extractCreatedWorldId([
      op("create", ".agents/worlds/cyber-wuxia/roles/shifu.yaml"),
      op("update", ".agents/config.yaml"),
      op("create", ".agents/worlds/cyber-wuxia/world.yaml"),
    ]);
    expect(id).toBe("cyber-wuxia");
  });

  test("an UPDATE to an existing world manifest is NOT a creation → undefined (fall back to reload)", () => {
    expect(
      extractCreatedWorldId([op("update", ".agents/worlds/yunling/world.yaml")]),
    ).toBeUndefined();
  });

  test("a non-world config edit (e.g. a rule change) creates no world → undefined", () => {
    expect(
      extractCreatedWorldId([
        op("create", ".agents/worlds/yunling/rules/qi-decay.yaml"),
        op("update", ".agents/worlds/yunling/state.yaml"),
      ]),
    ).toBeUndefined();
  });

  test("an empty operation list yields undefined", () => {
    expect(extractCreatedWorldId([])).toBeUndefined();
  });
});
