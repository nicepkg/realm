import { describe, expect, test } from "bun:test";
import type { RealmHttpClient } from "@realm/client-sdk";
import { t } from "./i18n.ts";
import { createRuntimeRoom, runRoleTurnFromTui } from "./runtime-actions.ts";
import type { TuiState } from "./types.ts";

const baseState: TuiState = {
  events: [],
  identity: "owner",
  messages: [],
  projectName: "demo",
  roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
  room: {
    id: "main",
    memberIds: ["owner", "leijun"],
    name: "All Hands",
    type: "group",
    worldId: "cultivation",
  },
  rooms: [],
  world: {
    defaultRoomId: "main",
    id: "cultivation",
    mode: { time: { kind: "manual" }, type: "game" },
    name: "Cultivation",
    roleIds: ["leijun"],
  },
  worlds: [],
};

describe("TUI runtime actions", () => {
  test("creates a runtime room through the client SDK contract", async () => {
    let request:
      | [string, { memberIds: string[]; name: string; type: string; idempotencyKey?: string }]
      | undefined;
    const client = {
      createRoom: async (worldId: string, input: NonNullable<typeof request>[1]) => {
        request = [worldId, input];
        return {
          room: { id: "qa-room", memberIds: input.memberIds, name: input.name, type: input.type },
        };
      },
    } as unknown as RealmHttpClient;

    const result = await createRuntimeRoom(
      client,
      baseState,
      { kind: "createRoom", memberIds: ["leijun"], name: "QA Room", roomType: "group" },
      t("en"),
    );

    expect(request?.[0]).toBe("cultivation");
    expect(request?.[1]).toMatchObject({ memberIds: ["leijun"], name: "QA Room", type: "group" });
    expect(result).toEqual({ notice: "Room created: QA Room.", roomId: "qa-room" });
  });

  test("runs a role turn in the current world and room", async () => {
    let request: [string, { prompt?: string; roleId: string; worldId: string }] | undefined;
    const client = {
      runRoleTurn: async (roomId: string, input: NonNullable<typeof request>[1]) => {
        request = [roomId, input];
        return {
          message: {
            content: "done",
            createdAt: new Date(0).toISOString(),
            displayedAuthorId: input.roleId,
            id: "message-1",
            realOperatorId: "owner",
          },
        };
      },
    } as unknown as RealmHttpClient;

    const notice = await runRoleTurnFromTui(
      client,
      baseState,
      { kind: "runRole", prompt: "ship it", roleId: "leijun" },
      t("en"),
    );

    expect(request).toEqual([
      "main",
      { prompt: "ship it", roleId: "leijun", worldId: "cultivation" },
    ]);
    expect(notice).toBe("Role turn completed for Lei Jun. Message: message-1.");
  });

  test("reports an unknown role instead of ignoring the command", async () => {
    const notice = await runRoleTurnFromTui(
      {} as unknown as RealmHttpClient,
      baseState,
      { kind: "runRole", roleId: "missing" },
      t("en"),
    );

    expect(notice).toBe("Unknown role: missing.");
  });
});
