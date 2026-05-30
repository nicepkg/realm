import type { ConfigPlannerModel } from "./index.ts";
import {
  classifyIntent,
  type IntentRouterContext,
  ModelBackedIntentRouter,
  type RealmIntent,
} from "./intent-router.ts";

/**
 * Shared fixtures for the broad adversarial phrasing battery
 * ({@link ./intent-battery.test.ts}). Kept in a co-located non-test module so the
 * battery file stays under the 500-line ceiling while every phrasing table and the
 * two engine drivers live in one source of truth (deterministic + model agree on
 * the SAME inputs).
 */

// --- Shared context: worlds populated so world-switch resolves ---------------

export const CONTEXT: IntentRouterContext = {
  roles: [
    { id: "gu-chenfeng", displayName: "顾辰风" },
    { id: "leijun", displayName: "雷军" },
    { id: "yunyao", displayName: "云遥" },
  ],
  rooms: [{ id: "main" }, { id: "sect-hall" }],
  worlds: [
    { id: "cultivation", name: "云岭修仙界" },
    { id: "software-company", name: "软件公司" },
  ],
  worldId: "cultivation",
  defaultRoomId: "main",
};

/** A stub model that always echoes one fixed JSON payload, simulating the provider. */
export function fixedModel(json: unknown): ConfigPlannerModel {
  return { complete: async () => JSON.stringify(json) };
}

/**
 * Run a single phrasing through BOTH engines and return both verdicts. For the
 * model engine we feed a payload the model would PLAUSIBLY emit for this phrasing,
 * so we test the full hydrate path (id resolution, context fill, write-guard), not
 * just a hard-coded echo.
 */
export async function bothEngines(
  goal: string,
  modelPayload: unknown,
): Promise<{ deterministic: RealmIntent; model: RealmIntent }> {
  const router = new ModelBackedIntentRouter(fixedModel(modelPayload));
  return {
    deterministic: classifyIntent(goal, CONTEXT),
    model: await router.classify(goal, CONTEXT),
  };
}

/** Intent families that perform a WRITE — the set a question must NEVER fall into. */
export const WRITE_KINDS = new Set<RealmIntent["kind"]>([
  "god",
  "state-patch",
  "run-turn",
  "world-switch",
]);

/**
 * "Say something / chat / a few words" run-turn phrasings — with and without a room
 * clause. These are IMPERATIVES that advance a role's turn, even though several
 * contain 什么 ("说点什么"). Live-model defect: '让顾辰风在全员议事说点什么' misrouted
 * to inspect (bare 什么 flagged interrogative + missing speak verb). Each row carries
 * the run-turn the model would emit so both engines are exercised on the same input.
 */
export const RUN_TURN_SPEAK_PHRASINGS: { goal: string; roleId: string }[] = [
  { goal: "让顾辰风在全员议事说点什么", roleId: "gu-chenfeng" },
  { goal: "让顾辰风说点什么", roleId: "gu-chenfeng" },
  { goal: "让云遥说些什么", roleId: "yunyao" },
  { goal: "让雷军说几句", roleId: "leijun" },
  { goal: "让顾辰风在主厅说几句", roleId: "gu-chenfeng" },
  { goal: "让云遥聊聊", roleId: "yunyao" },
  { goal: "让雷军聊几句", roleId: "leijun" },
  { goal: "让顾辰风讲两句", roleId: "gu-chenfeng" },
  { goal: "让云遥说说", roleId: "yunyao" },
];

/**
 * THE LOAD-BEARING table. Every utterance carries a WRITE keyword + a REAL role (or
 * world), yet is phrased as a question — so NONE may route to a write family; all
 * must be inspect. Each row also carries the write the model would WRONGLY emit, so
 * the same row drives both the deterministic classifier and the guarded model
 * router (proving NO-QUESTION-WRITE holds even when the provider is wrong).
 *
 * Note: switch-marker-adjacent questions ("进入软件公司之后会怎样？") are deliberately
 * EXCLUDED — they are a known classifier gap pinned as `test.todo` in the battery.
 */
export const INTERROGATIVE_WRITE_KEYWORDS: { goal: string; modelWrite: unknown }[] = [
  // god keyword + role, as a question
  {
    goal: "顾辰风被禁言了吗？",
    modelWrite: { kind: "god", targetRoleId: "gu-chenfeng", action: "mute", reason: "x" },
  },
  {
    goal: "需要把雷军禁言吗",
    modelWrite: { kind: "god", targetRoleId: "leijun", action: "mute", reason: "x" },
  },
  {
    goal: "能不能帮我把雷军禁言",
    modelWrite: { kind: "god", targetRoleId: "leijun", action: "mute", reason: "x" },
  },
  {
    goal: "顾辰风是不是已经被处死了？",
    modelWrite: { kind: "god", targetRoleId: "gu-chenfeng", action: "kill", reason: "x" },
  },
  // state-patch keyword + role, as a question
  {
    goal: "顾辰风中毒了吗",
    modelWrite: {
      kind: "state-patch",
      operations: [
        { op: "append", path: "/privateState/roles/gu-chenfeng/conditions", value: "中毒" },
      ],
      reason: "x",
    },
  },
  {
    goal: "要不要给云遥加上受伤状态？",
    modelWrite: {
      kind: "state-patch",
      operations: [{ op: "append", path: "/privateState/roles/yunyao/conditions", value: "受伤" }],
      reason: "x",
    },
  },
  {
    goal: "雷军的状态设为什么了？",
    modelWrite: {
      kind: "state-patch",
      operations: [{ op: "set", path: "/privateState/roles/leijun/status", value: "?" }],
      reason: "x",
    },
  },
  // run-turn keyword + role, as a question
  {
    goal: "云遥发言了吗？",
    modelWrite: { kind: "run-turn", roleId: "yunyao" },
  },
  {
    goal: "轮到顾辰风说话了吗",
    modelWrite: { kind: "run-turn", roleId: "gu-chenfeng" },
  },
  // world keyword + world name, as a question (NO bare switch marker adjacent)
  {
    goal: "软件公司现在什么状态？",
    modelWrite: { kind: "world-switch", worldId: "software-company" },
  },
  {
    goal: "软件公司是不是当前激活的世界？",
    modelWrite: { kind: "world-switch", worldId: "software-company" },
  },
];
