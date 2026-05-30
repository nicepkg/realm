import { describe, expect, test } from "bun:test";
import type { ConfigPlannerModel, IntentRouterContext } from "@realm/assistant";
import { defaultProjectConfig, defaultUserConfig, type SettingsSnapshot } from "@realm/config";
import { FakePiBridge } from "@realm/pi-bridge";
import { IntentRouteService } from "./intent-route-service.ts";

/**
 * IntentRouteService contract: the model-backed router is the PRIMARY path, the
 * deterministic classifier is a HARD fallback, and the whole surface is
 * failure-proof — a model that throws / returns garbage degrades to a coherent,
 * write-safe deterministic intent rather than surfacing an error.
 */

const CONTEXT: IntentRouterContext = {
  roles: [{ id: "gu-chenfeng", displayName: "顾辰风" }],
  rooms: [{ id: "main" }],
  worlds: [{ id: "cultivation", name: "云岭修仙界" }],
  worldId: "cultivation",
  defaultRoomId: "main",
};

function settingsSnapshot(): SettingsSnapshot {
  return {
    user: defaultUserConfig(),
    project: defaultProjectConfig("intent-test"),
    paths: {
      userConfigPath: "/tmp/user.yaml",
      projectConfigPath: "/tmp/project.yaml",
      projectLocalConfigPath: "/tmp/project.local.yaml",
    },
  };
}

function service(options: {
  fakeRuntime?: boolean;
  modelOverride?: ConfigPlannerModel;
}): IntentRouteService {
  return new IntentRouteService({
    fakeRuntime: options.fakeRuntime ?? false,
    piBridge: new FakePiBridge(),
    root: "/tmp/realm-intent-test",
    env: {},
    getSettings: async () => settingsSnapshot(),
    modelOverride: options.modelOverride,
  });
}

/** A model that always echoes one fixed JSON payload (simulating a provider). */
function fixedModel(json: unknown): ConfigPlannerModel {
  return { complete: async () => JSON.stringify(json) };
}

describe("IntentRouteService — model-backed PRIMARY path", () => {
  test("a valid model response drives the intent", async () => {
    const routed = await service({
      modelOverride: fixedModel({
        kind: "god",
        targetRoleId: "gu-chenfeng",
        action: "mute",
        reason: "作弊",
      }),
    }).routeIntent({ goal: "把顾辰风禁言", context: CONTEXT });
    expect(routed.kind).toBe("god");
    if (routed.kind !== "god") {
      throw new Error("expected a god intent");
    }
    expect(routed.targetRoleId).toBe("gu-chenfeng");
    expect(routed.action).toBe("mute");
  });
});

describe("IntentRouteService — deterministic HARD fallback (always write-safe)", () => {
  test("a throwing model degrades to the deterministic classification", async () => {
    const throwingModel: ConfigPlannerModel = {
      complete: async () => {
        throw new Error("provider down");
      },
    };
    const routed = await service({ modelOverride: throwingModel }).routeIntent({
      goal: "把顾辰风禁言",
      context: CONTEXT,
    });
    // Deterministic classifier still produces the imperative god write.
    expect(routed.kind).toBe("god");
  });

  test("a garbage model response degrades to the deterministic classification", async () => {
    const routed = await service({
      modelOverride: { complete: async () => "not json at all" },
    }).routeIntent({ goal: "现在世界什么状态？", context: CONTEXT });
    // An unparseable model reply falls back; a question routes to a read.
    expect(routed.kind).toBe("inspect");
  });

  test("fake runtime always uses the deterministic router (no provider)", async () => {
    const routed = await service({ fakeRuntime: true }).routeIntent({
      goal: "顾辰风被禁言了吗？",
      context: CONTEXT,
    });
    // A question must never become a write — deterministic routes it to inspect.
    expect(routed.kind).toBe("inspect");
  });
});
