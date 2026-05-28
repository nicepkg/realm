import { describe, expect, test } from "bun:test";
import { RealmTuiApp } from "./realm-tui-app.ts";
import type { TuiState } from "./types.ts";

describe("RealmTuiApp interactive safety", () => {
  test("role picker selection prompts instead of switching identity directly", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as { state: TuiState };
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      rooms: [],
      worlds: [],
    };

    const notice = await app.applyPaletteItem("role:leijun");
    expect(notice).toContain("Switch composer identity");
    expect(harness.state.identity).toBe("owner");

    const confirmed = await app.handleInteractiveInput(
      "y",
      () => {},
      async () => {},
    );
    expect(confirmed).toContain("Lei Jun");
    expect(harness.state.identity).toBe("leijun");
  });

  test("memory command uses the operator role memory endpoint", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as {
      client: { readRoleMemory: (worldId: string, roleId: string) => Promise<{ content: string }> };
      state: TuiState;
    };
    let request: [string, string] | undefined;
    harness.client.readRoleMemory = async (worldId, roleId) => {
      request = [worldId, roleId];
      return { content: "remember launch plan" };
    };
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
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

    const notice = await app.handleInteractiveInput(
      ":memory leijun",
      () => {},
      async () => {},
    );

    expect(request).toEqual(["cultivation", "leijun"]);
    expect(notice).toContain("leijun");
    expect(harness.state.memoryInspection).toContain("remember launch plan");
  });
});
