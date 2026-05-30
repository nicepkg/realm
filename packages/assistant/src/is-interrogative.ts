/**
 * Question detection for the intent classifier. A QUESTION must never become a
 * write: every write-bearing branch in `classifyIntent` defers to a read when an
 * utterance is interrogative. Kept in its own tiny module so the classifier stays
 * under the 500-line ceiling.
 */

/** True when any needle appears verbatim in the haystack. */
function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Interrogative lead-ins / wh-words that reliably mark a QUESTION anywhere in the
 * sentence ("如何 / 怎么样 / 有没有 / 是否"). These are unambiguous reads, so their
 * presence anywhere is enough. NOTE: 什么 is deliberately NOT here — bare 什么 is
 * ambiguous because an imperative "(说|做|聊|讲|来)(点|些|两句|几句)?什么" ("说点什么")
 * is a directive to SPEAK, not a question. It is handled by {@link hasWhQuestion}.
 */
const QUESTION_LEADINS = ["如何", "怎么", "怎样", "有没有", "是否", "是不是"];

/**
 * Imperative "speak / do / chat something" phrasing: a speak/act verb directly
 * before 什么 ("说点什么 / 说些什么 / 做点什么 / 聊点什么 / 讲两句什么 / 来几句什么").
 * These are DIRECTIVES ("say something"), NOT wh-questions, so 什么 here must not
 * trip the interrogative guard (otherwise the run-turn branch is wrongly skipped).
 * The quantifier (点/些/两句/几句) is optional so "说什么" also counts as imperative.
 */
const IMPERATIVE_SPEAK_WH_PATTERN = /(说|做|聊|讲|来)(点|些|两句|几句)?什么/u;

/**
 * True when 什么 is used as a genuine wh-question word ("什么状态 / 是什么 / 知道什么"),
 * NOT as the object of an imperative speak verb ("说点什么"). We treat every 什么 as a
 * question word EXCEPT when its only occurrence(s) are the imperative-speak form. A
 * sentence may mix both ("先说点什么，现在是什么状态？") — any 什么 left after stripping
 * the imperative-speak matches is a real wh-question.
 */
function hasWhQuestion(goal: string): boolean {
  if (!goal.includes("什么")) {
    return false;
  }
  // Remove imperative-speak "(说|聊|…)…什么" occurrences; any 什么 still standing is
  // a genuine wh-question word.
  const withoutImperativeSpeak = goal.replace(new RegExp(IMPERATIVE_SPEAK_WH_PATTERN, "gu"), "");
  return withoutImperativeSpeak.includes("什么");
}

/**
 * Clause-final question particles. Unlike the lead-ins above, 吗/呢 are only a
 * reliable question signal when they sit at the END of the utterance (or a clause,
 * i.e. immediately before terminal/clause punctuation) — mid-sentence they can be
 * plain particles ("把他禁言吧" is a softened imperative, not a question).
 */
const FINAL_QUESTION_PARTICLES = ["吗", "呢"];

/** Clause boundaries that a final particle may sit immediately before. */
const CLAUSE_TERMINATORS = ["？", "?", "。", "！", "!", "，", ",", "、", "；", ";", "\n"];

/**
 * The canonical Mandarin A-not-A / V-not-V yes-no-question shape: a single CJK
 * character repeated around 不 or 没 ("是不是 / 对不对 / 能不能 / 会不会 / 在不在 /
 * 有没有"). The back-reference (\1) forces the flanking token to be IDENTICAL, so a
 * non-question with different characters around 不 ("不死不休" → 死…休) never matches.
 */
const A_NOT_A_PATTERN = /([一-鿿])[不没]\1/u;

/** True when the goal contains an A-not-A / V-not-V yes-no-question construction. */
function hasANotAQuestion(goal: string): boolean {
  return A_NOT_A_PATTERN.test(goal);
}

/**
 * True when a 吗/呢 particle is the last meaningful character of the goal or of a
 * clause (directly before a terminator). This keeps "顾辰风被禁言了吗" (question)
 * apart from any sentence that merely contains 吗/呢 mid-word.
 */
function hasClauseFinalParticle(goal: string): boolean {
  const trimmed = goal.trimEnd();
  for (const particle of FINAL_QUESTION_PARTICLES) {
    let from = 0;
    let index = trimmed.indexOf(particle, from);
    while (index !== -1) {
      const next = trimmed[index + particle.length];
      if (next === undefined || CLAUSE_TERMINATORS.includes(next)) {
        return true;
      }
      from = index + particle.length;
      index = trimmed.indexOf(particle, from);
    }
  }
  return false;
}

/**
 * Detect whether an utterance is interrogative — a question that must be answered
 * (routed to inspect), never executed as a God/state write.
 *
 * Signals (any one is enough):
 *  - a question mark (？/?);
 *  - a wh-word / question lead-in (如何 / 怎么 / 有没有 / 是否 / 是不是) anywhere;
 *  - a 什么 wh-question ("什么状态 / 是什么 / 知道什么") — but NOT an imperative speak
 *    "说点什么 / 聊点什么 / 做点什么" (a directive to act, not a question);
 *  - an A-not-A / V-not-V construction (对不对 / 能不能 / 在不在), with identical
 *    flanking tokens so "不死不休" never over-matches;
 *  - a clause-final question particle (吗 / 呢) at the end of the goal or a clause.
 *
 * 吗/呢 are gated to clause-final position so a softened imperative ("把他禁言吧")
 * or a mid-clause particle never trips the guard.
 */
export function isInterrogative(goal: string): boolean {
  if (includesAny(goal, ["?", "？"])) {
    return true;
  }
  if (includesAny(goal, QUESTION_LEADINS)) {
    return true;
  }
  if (hasWhQuestion(goal)) {
    return true;
  }
  if (hasANotAQuestion(goal)) {
    return true;
  }
  return hasClauseFinalParticle(goal);
}
