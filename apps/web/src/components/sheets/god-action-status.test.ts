import { describe, expect, test } from "bun:test";
import {
  firstValidAction,
  godConsequenceText,
  isActionValidForStatus,
  type RoleLifecycleStatus,
  readRoleLifecycleStatus,
  statusLabelParts,
} from "./god-action-status.ts";

describe("readRoleLifecycleStatus", () => {
  test("reads alive/muted from metaState.roles.<id>", () => {
    const state = {
      metaState: { roles: { leijun: { alive: true, muted: false } } },
    };
    expect(readRoleLifecycleStatus(state, "leijun")).toEqual({ alive: true, muted: false });
  });

  test("returns unknown when world state is absent (non-simulation world)", () => {
    expect(readRoleLifecycleStatus(undefined, "leijun")).toEqual({
      alive: undefined,
      muted: undefined,
    });
  });

  test("returns unknown when role id is empty", () => {
    const state = { metaState: { roles: { leijun: { alive: true, muted: false } } } };
    expect(readRoleLifecycleStatus(state, "")).toEqual({ alive: undefined, muted: undefined });
  });

  test("returns unknown when metaState/roles/entry are missing or malformed", () => {
    const unknown = { alive: undefined, muted: undefined };
    expect(readRoleLifecycleStatus({}, "leijun")).toEqual(unknown);
    expect(readRoleLifecycleStatus({ metaState: 1 }, "leijun")).toEqual(unknown);
    expect(readRoleLifecycleStatus({ metaState: { roles: "nope" } }, "leijun")).toEqual(unknown);
    expect(readRoleLifecycleStatus({ metaState: { roles: {} } }, "leijun")).toEqual(unknown);
    expect(
      readRoleLifecycleStatus({ metaState: { roles: { leijun: { alive: "yes" } } } }, "leijun"),
    ).toEqual(unknown);
  });

  test("reads each field independently when only one is present", () => {
    expect(
      readRoleLifecycleStatus({ metaState: { roles: { leijun: { muted: true } } } }, "leijun"),
    ).toEqual({ alive: undefined, muted: true });
  });
});

describe("isActionValidForStatus", () => {
  const alive: RoleLifecycleStatus = { alive: true, muted: false };
  const dead: RoleLifecycleStatus = { alive: false, muted: false };
  const aliveMuted: RoleLifecycleStatus = { alive: true, muted: true };
  const unknown: RoleLifecycleStatus = { alive: undefined, muted: undefined };

  test("alive role: cannot revive, can kill, can mute", () => {
    expect(isActionValidForStatus("revive", alive)).toBe(false);
    expect(isActionValidForStatus("kill", alive)).toBe(true);
    expect(isActionValidForStatus("mute", alive)).toBe(true);
  });

  test("dead role: can revive, cannot kill, cannot mute", () => {
    expect(isActionValidForStatus("revive", dead)).toBe(true);
    expect(isActionValidForStatus("kill", dead)).toBe(false);
    expect(isActionValidForStatus("mute", dead)).toBe(false);
  });

  test("already-muted alive role: cannot mute again", () => {
    expect(isActionValidForStatus("mute", aliveMuted)).toBe(false);
    expect(isActionValidForStatus("kill", aliveMuted)).toBe(true);
  });

  test("unknown status: every action is valid (non-simulation worlds not blocked)", () => {
    expect(isActionValidForStatus("revive", unknown)).toBe(true);
    expect(isActionValidForStatus("kill", unknown)).toBe(true);
    expect(isActionValidForStatus("mute", unknown)).toBe(true);
  });
});

describe("firstValidAction", () => {
  test("alive role first valid action is mute", () => {
    expect(firstValidAction({ alive: true, muted: false })).toBe("mute");
  });

  test("alive muted role first valid action is kill", () => {
    expect(firstValidAction({ alive: true, muted: true })).toBe("kill");
  });

  test("dead role first valid action is revive", () => {
    expect(firstValidAction({ alive: false, muted: false })).toBe("revive");
  });

  test("unknown status first valid action is mute (default order)", () => {
    expect(firstValidAction({ alive: undefined, muted: undefined })).toBe("mute");
  });
});

describe("statusLabelParts", () => {
  const t = (key: string) => key;

  test("joins alive + muted labels with a middot", () => {
    expect(statusLabelParts({ alive: true, muted: false }, t)).toBe(
      "sheet.god.statusAlive · sheet.god.statusUnmuted",
    );
    expect(statusLabelParts({ alive: false, muted: true }, t)).toBe(
      "sheet.god.statusDead · sheet.god.statusMuted",
    );
  });

  test("returns undefined when lifecycle is unknown so the line can be hidden", () => {
    expect(statusLabelParts({ alive: undefined, muted: undefined }, t)).toBeUndefined();
  });

  test("renders a single known field when the other is unknown", () => {
    expect(statusLabelParts({ alive: true, muted: undefined }, t)).toBe("sheet.god.statusAlive");
    expect(statusLabelParts({ alive: undefined, muted: true }, t)).toBe("sheet.god.statusMuted");
  });
});

describe("godConsequenceText", () => {
  test("zh-CN names the role and the world-truth effect per action", () => {
    expect(godConsequenceText("kill", "雷军", "修真界", "zh-CN")).toBe(
      "处决 雷军：该角色将停止参与回合，并在 修真界 中被标记为死亡。",
    );
    expect(godConsequenceText("mute", "雷军", "修真界", "zh-CN")).toBe(
      "禁言 雷军：该角色将在 修真界 中被禁止发言。",
    );
    expect(godConsequenceText("revive", "雷军", "修真界", "zh-CN")).toBe(
      "复活 雷军：该角色将在 修真界 中恢复参与回合。",
    );
  });

  test("en names the role and the world-truth effect per action", () => {
    expect(godConsequenceText("kill", "Lei Jun", "Cultivation Realm", "en")).toBe(
      "Kill Lei Jun: the role stops taking turns and is marked dead in Cultivation Realm.",
    );
    expect(godConsequenceText("mute", "Lei Jun", "Cultivation Realm", "en")).toBe(
      "Mute Lei Jun: the role is silenced in Cultivation Realm.",
    );
    expect(godConsequenceText("revive", "Lei Jun", "Cultivation Realm", "en")).toBe(
      "Revive Lei Jun: the role resumes taking turns in Cultivation Realm.",
    );
  });
});
