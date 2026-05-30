/**
 * Create-world "structure clue" detection. Split out of `index.ts` to keep that
 * file under the 500-line budget; re-exported from `index.ts` so import sites are
 * unaffected.
 */

/**
 * Role/organization nouns that signal a create-world goal also describes
 * INHABITANTS the operator expects to exist (宗门/对手/师父/门派/敌人/盟友 …).
 * `inferWorldFromGoal` deliberately keeps `roleIds: []` — the runtime never
 * synthesizes characters the operator did not explicitly author — so these clues
 * would otherwise be silently dropped. The hook uses this detector to follow up
 * honestly after the (empty) world is created, offering to build the named
 * structure out, instead of letting the operator believe the bare world is what
 * they asked for (F2, findings option b).
 */
const WORLD_STRUCTURE_CLUE_NOUNS: readonly string[] = [
  "宗门",
  "门派",
  "师门",
  "师父",
  "师傅",
  "师尊",
  "对手",
  "敌人",
  "仇敌",
  "宿敌",
  "反派",
  "盟友",
  "同门",
  "弟子",
  "长老",
  "掌门",
  "帮派",
  "组织",
  "势力",
  "家族",
  "阵营",
];

/**
 * Pure: detect the role/organization "structure clues" present in a create-world
 * goal so a caller can honestly follow up after creating the (intentionally empty)
 * world. Returns the matched nouns in first-seen order, de-duped; an empty array
 * means the goal named no inhabitants and the bare world fully satisfies it.
 *
 * This does NOT mutate the world patch (`inferWorldFromGoal` still returns
 * `roleIds: []`) — we never fabricate characters the operator did not author.
 */
export function detectWorldStructureClues(goal: string): string[] {
  const seen = new Set<string>();
  for (const noun of WORLD_STRUCTURE_CLUE_NOUNS) {
    if (goal.includes(noun)) {
      seen.add(noun);
    }
  }
  return [...seen];
}
