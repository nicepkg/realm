import path from "node:path";
import { readFlag } from "./smoke-browser-utils.ts";

/**
 * Flow presets + CLI parsing for capture-docs-shots. Split out so the capture
 * driver stays focused on browser orchestration and both files stay <500 lines.
 *
 * The capture script is honest by construction: every screenshot is whatever the
 * live app rendered after typing a real zh-CN utterance against the chosen
 * example world. Which example/world/utterances to drive is parameterized here so
 * the SAME driver can prove the NL flows generalize beyond cultivation-sim
 * (e.g. examples/boardroom-saga, a 商战 world) and the docs FlowShowcase evidence
 * stays reproducible — not hard-coded to one demo.
 */

export type FlowDef = {
  /** Base shot id — must match content-flows FlowStep.shot for docs-bound presets. */
  shot: string;
  /** The exact zh-CN utterance typed into the one chat window. */
  utterance: string;
  /** Whether this flow stages a risky write that needs confirming before capture. */
  confirm: boolean;
  /**
   * Capture the inline PREVIEW card instead of the post-confirm result. Used for
   * create-world: confirming it switches the workspace INTO the freshly created
   * (empty) world, so the most illustrative "talk to 天道" frame is the proposal
   * card the operator reviews before writing — the signature NL-first moment.
   */
  previewOnly?: boolean;
};

export type CapturePreset = {
  /** Preset id (also the default --preset value's identity). */
  id: string;
  /** Project directory the web app boots against (absolute or repo-relative). */
  exampleDir: string;
  /** The world id the flows operate on (for state-version evidence + defaults). */
  worldId: string;
  /** The 6 core NL flows, in docs order. */
  flows: FlowDef[];
};

/**
 * cultivation-sim — the docs-default preset. Its shot ids + utterances MUST mirror
 * apps/docs/src/content-flows.ts so each captured PNG matches the quoted message
 * the FlowShowcase renders. Do not drift these without updating content-flows.
 */
const CULTIVATION_FLOWS: FlowDef[] = [
  {
    confirm: true,
    previewOnly: true,
    shot: "create-world",
    utterance: "创建一个有宗门、对手和师父的修真世界",
  },
  { confirm: true, shot: "set-rule", utterance: "设定规则：每天掉一点灵气，灵石可以买丹药" },
  { confirm: true, shot: "add-role", utterance: "加一个谨慎、爱钱的炼丹师，叫云遥" },
  { confirm: true, shot: "run-turn", utterance: "现在让顾辰风说话" },
  { confirm: true, shot: "god-action", utterance: "顾辰风作弊，把他禁言" },
  { confirm: false, shot: "state-inspect", utterance: "现在世界什么状态？" },
];

/**
 * boardroom-saga — the breadth preset proving the SAME 6 NL flows generalize to a
 * 商战 (corporate-war) domain. Utterances are tuned to锐峰科技董事会's roles
 * (陈牧/林晚/赵柯) and rules. Shot ids reuse the docs base ids so the evidence is
 * directly comparable to cultivation; PNGs are written with the preset prefix so
 * the two sets never collide.
 */
const BOARDROOM_FLOWS: FlowDef[] = [
  {
    confirm: true,
    previewOnly: true,
    shot: "create-world",
    utterance: "创建一个有董事会、对手资本和并购战的商战世界",
  },
  { confirm: true, shot: "set-rule", utterance: "设定规则：每季度现金流低于阈值触发审计" },
  { confirm: true, shot: "add-role", utterance: "加一个叫周野的并购顾问，激进、只看回报" },
  { confirm: true, shot: "run-turn", utterance: "现在让陈牧说话" },
  { confirm: true, shot: "god-action", utterance: "林晚泄露内幕，把她禁言" },
  { confirm: false, shot: "state-inspect", utterance: "现在董事会什么状态？" },
];

const PRESETS: Record<string, Omit<CapturePreset, "exampleDir"> & { exampleDir: string }> = {
  boardroom: {
    exampleDir: path.join("examples", "boardroom-saga"),
    flows: BOARDROOM_FLOWS,
    id: "boardroom",
    worldId: "boardroom",
  },
  cultivation: {
    exampleDir: path.join("examples", "cultivation-sim"),
    flows: CULTIVATION_FLOWS,
    id: "cultivation",
    worldId: "cultivation",
  },
};

const DEFAULT_PRESET = "cultivation";

/**
 * Resolve the capture preset from CLI flags / env, with the docs-default
 * (cultivation-sim) when nothing is passed so existing docs capture is unchanged.
 *
 *   --preset boardroom            built-in 商战 preset
 *   --example examples/foo        override the project dir (keeps preset's flows)
 *   --world  foo                  override the world id used for state evidence
 *   --prefix foo                  override the PNG filename prefix (default: "")
 *
 * The cultivation preset writes bare "<shot>-<viewport>.png" (the names the docs
 * FlowShowcase expects); any non-default preset writes "<prefix>-<shot>-..." so a
 * breadth capture never overwrites the canonical docs shots.
 */
export function resolveCapturePlan(repoRoot: string): {
  preset: CapturePreset;
  /** Filename prefix for the PNGs (e.g. "boardroom-"); "" for the docs default. */
  prefix: string;
} {
  const presetId = readFlag("--preset") ?? process.env.REALM_CAPTURE_PRESET ?? DEFAULT_PRESET;
  const base = PRESETS[presetId];
  if (!base) {
    const known = Object.keys(PRESETS).join(", ");
    throw new Error(`Unknown --preset "${presetId}". Known presets: ${known}.`);
  }

  const exampleOverride = readFlag("--example") ?? process.env.REALM_CAPTURE_EXAMPLE;
  const worldOverride = readFlag("--world") ?? process.env.REALM_CAPTURE_WORLD;
  const exampleDir = path.resolve(repoRoot, exampleOverride ?? base.exampleDir);

  const preset: CapturePreset = {
    exampleDir,
    flows: base.flows,
    id: base.id,
    worldId: worldOverride ?? base.worldId,
  };

  // The docs-default preset (cultivation, no overrides) keeps bare shot names so
  // the FlowShowcase finds them; everything else gets a collision-proof prefix.
  const explicitPrefix = readFlag("--prefix") ?? process.env.REALM_CAPTURE_PREFIX;
  const isDocsDefault = presetId === DEFAULT_PRESET && !exampleOverride;
  const prefix = explicitPrefix ?? (isDocsDefault ? "" : `${preset.id}-`);

  return { preset, prefix };
}
