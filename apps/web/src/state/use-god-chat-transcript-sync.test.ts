import { describe, expect, test } from "bun:test";
import type { Message } from "@realm/api-contract";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import { roleSpeechPostedTurn } from "@/state/god-chat-role-turn.ts";
import {
  bubblesForMessage,
  makeHarness,
  makeWorldScopedHarness,
  postedMsg,
} from "@/state/use-god-chat-transcript-sync-harness.ts";

/**
 * Reload TRIPLE-render regression (P1) for `useGodChatTranscriptSync`.
 *
 * BUG: after running a role's turn then RELOADING, the single backend role-speech
 * message rendered THREE times — once correctly in its chronological slot, and twice
 * re-appended at the bottom. The backend holds exactly ONE such message (fakeReply is
 * deterministic per roleId/turnIndex), so this was a frontend re-fold, not duplicate
 * data. ROOT CAUSE: on hydration `events`/`messages`/`turns` settle across several
 * rapid re-renders; the posted-fold effect re-runs each time but reads a STALE `turns`
 * snapshot that does NOT yet contain the bubble its own prior pass appended (setTurns
 * is async), so the same message.id keeps passing the "not represented" check.
 *
 * The repo has no DOM/renderHook infra, so the harnesses (in
 * `use-god-chat-transcript-sync-harness.ts`) drive the EXACT effect bodies the hook
 * runs — `settleRunTurn` + `settleBoundMessageId` (active-run-turn effect) and
 * `selectFoldsWithIdGate` (posted-fold effect) — through a faithful re-render harness
 * that reproduces the bug's precondition: a STABLE ref Set surviving across renders
 * and a `turns` snapshot whose committed value LAGS each effect's append. The fix is
 * proven by asserting exactly ONE role-speech bubble for the message id after the
 * settle storm.
 */

describe("reload triple-render dedup — posted-only path (P1)", () => {
  test("the SAME backend message re-folded across the hydration storm renders ONCE", () => {
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");
    const harness = makeHarness({ messages: [message] });

    // The reload re-render storm: identical inputs, several rapid passes. Without the
    // id gate, each pass re-folds the message (committed snapshot lags), stacking 3+
    // bubbles at the bottom. With it, only the first pass folds.
    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    expect(bubblesForMessage(harness.turns, "m1")).toHaveLength(1);
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(1);
  });
});

describe("reload double-bubble — hydrated transcript seeds the gate (P1)", () => {
  const message = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");

  test("a persisted bubble WITH a bound sourceMessageId is never re-folded after reload", () => {
    // Reload: persistence hydrated `turns` with the settled bubble bound to m1, and
    // events re-poll re-delivers the same message.created. The gate, seeded from the
    // hydrated bubble's sourceMessageId, vetoes the re-fold across the whole storm.
    const hydratedBubble: ChatTurn = {
      ...roleSpeechPostedTurn(message, "顾辰风"),
      id: "hydrated-1",
    };
    const harness = makeHarness({
      hydratedTurns: [hydratedBubble],
      messages: [message],
    });

    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    expect(bubblesForMessage(harness.turns, "m1")).toHaveLength(1);
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(1);
  });

  test("a persisted bubble that settled id-LESS still folds at most once after reload", () => {
    // The harder case: the live stream finished before its posted twin landed, so the
    // bubble persisted WITHOUT a sourceMessageId (only the fuzzy-text backstop). The
    // gate can't seed it by id, but the secondary text-containment guard must still
    // keep the re-delivered message from stacking a second bubble across the storm.
    const idLessBubble: ChatTurn = {
      card: {
        detail: "我已闭关三日，今日方出。",
        kind: "run-turn",
        speakerName: "顾辰风",
        streaming: false,
        variant: "role-speech",
      },
      id: "hydrated-idless",
      role: "system",
      text: "",
    };
    const harness = makeHarness({
      hydratedTurns: [idLessBubble],
      messages: [message],
    });

    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(1);
  });

  test("id-less bubble whose streamed text DIVERGES from content is reconciled, not re-folded at tail", () => {
    // The round-5 regression: the live stream settled BEFORE its posted twin landed, so
    // the bubble persisted id-LESS and its streamed text is a PREFIX of the backend
    // message.content (a trailing token dropped). The hydrated transcript also holds a
    // prior operator turn, so a blind tail-append would strand the re-fold at the very
    // bottom (after the operator line) AND duplicate the reply. The reconcile must bind
    // the bubble to its message id, leaving EXACTLY ONE role-speech bubble in slot.
    const fullMessage = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");
    const operatorTurn: ChatTurn = { id: "op-1", role: "operator", text: "让顾辰风发言" };
    const idLessStreamed: ChatTurn = {
      card: {
        detail: "我已闭关三日，", // streamed prefix — diverges from the posted content
        kind: "run-turn",
        speakerName: "顾辰风",
        streaming: false,
        variant: "role-speech",
      },
      id: "hydrated-idless",
      role: "system",
      text: "",
    };
    const harness = makeHarness({
      hydratedTurns: [operatorTurn, idLessStreamed],
      messages: [fullMessage],
    });

    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    const speech = harness.turns.filter((turn) => turn.card?.variant === "role-speech");
    expect(speech).toHaveLength(1);
    // The single bubble is the persisted in-slot one (right after the operator line),
    // now BOUND to m1 by the reconcile — never a stray tail-appended re-fold.
    expect(bubblesForMessage(harness.turns, "m1")).toHaveLength(1);
    const speechIndex = harness.turns.findIndex((turn) => turn.card?.variant === "role-speech");
    const operatorIndex = harness.turns.findIndex((turn) => turn.role === "operator");
    expect(speechIndex).toBe(operatorIndex + 1);
    expect(harness.turns[speechIndex]?.id).toBe("hydrated-idless");
  });

  test("id-less bubble whose backend message lands LATE on reload is bound, not double-folded", () => {
    // The LIVE reload double-bubble: the run-turn reply settled id-less (its posted twin
    // landed after the live stream finished), so the bubble persisted WITHOUT a
    // sourceMessageId. On reload `app.state.messages` hydrate a render or two AFTER the
    // transcript is restored — so on the FIRST stable render the reconcile fires against
    // ZERO messages and finds nothing. The fix DEFERS burning the once-per-scope guard
    // while messages are absent and the bubble is still un-bound, so when the message
    // finally lands the reconcile re-runs and binds it — instead of leaving it blind to
    // the id-gate and letting the posted-fold effect stack a SECOND bubble at the tail.
    const fullMessage = postedMsg("m1", "guchenfeng", "我先理一理眼下的局势，再做定夺。");
    const idLessBubble: ChatTurn = {
      card: {
        // Streamed text diverges from the posted content (a trailing token dropped) so
        // the fuzzy-text backstop alone is NOT enough — the reconcile must bind by id.
        detail: "我先理一理眼下的局势，",
        kind: "run-turn",
        speakerName: "顾辰风",
        streaming: false,
        variant: "role-speech",
      },
      id: "hydrated-idless",
      role: "system",
      text: "",
    };
    const harness = makeHarness({
      deliverMessagesLate: true,
      hydratedTurns: [idLessBubble],
      messages: [fullMessage],
    });

    // First N renders: the message has NOT hydrated yet (reload lag). Reconcile finds
    // nothing; the fix must NOT burn the guard, leaving room to re-run once it lands.
    harness.render();
    harness.render();
    expect(bubblesForMessage(harness.turns, "m1")).toHaveLength(0);

    // The backend message lands; the re-render storm follows.
    harness.deliverMessages();
    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    // EXACTLY ONE role-speech bubble, bound to m1 by the (now un-deferred) reconcile —
    // never a stray second bubble re-folded at the tail by the posted-fold effect.
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(1);
    expect(bubblesForMessage(harness.turns, "m1")).toHaveLength(1);
    expect(harness.turns[0]?.id).toBe("hydrated-idless");
  });

  test("an ID-BOUND persisted bubble that hydrates LATE is not re-folded (self-healing gate)", () => {
    // The forensic live double-bubble (云遥 trust-retry path): the reply settled
    // ID-BOUND, so the persisted bubble carries a sourceMessageId. BUT on reload the
    // world id resolves async — when the scope settles, the persistence scope-load
    // effect has NOT yet swapped the saved transcript into `turns`, so the lazy/scope
    // gate seed reads an EMPTY transcript and seals the gate empty. The bound bubble
    // lands a render LATER; without the per-render `mergeBoundIdsFromTurns` re-seed the
    // posted-fold effect then re-folds its backend message into a SECOND bubble (both
    // end up bound to the SAME message id — exactly the localStorage forensic showed).
    const boundBubble: ChatTurn = {
      ...roleSpeechPostedTurn(message, "顾辰风"),
      id: "hydrated-bound",
    };
    const harness = makeHarness({
      deliverMessagesLate: true,
      hydrateTurnsLate: true,
      hydratedTurns: [boundBubble],
      messages: [message],
    });

    // Renders BEFORE anything hydrates: gate sealed empty, turns empty, no messages.
    harness.render();
    harness.render();
    // The persistence scope-load effect swaps the saved (bound) transcript into state
    // AND `app.state.messages` hydrate in the SAME commit window — but the posted-fold
    // effect's decision still reads the pre-hydration (empty) `turns` closure, and the
    // gate seed already sealed empty. `insertFoldsByTimestamp` then blindly appends the
    // fold decided from that stale snapshot regardless of the now-committed bound bubble
    // — the exact mechanism that stacked a SECOND bound bubble live. Only the gate can
    // veto it; the self-healing merge is what puts m1 in the gate in time.
    harness.deliverTurns();
    harness.deliverMessages();
    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    // EXACTLY ONE role-speech bubble — the persisted one. The self-healing merge put
    // m1 into the gate the instant the bubble landed, vetoing the posted-fold re-fold.
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(1);
    expect(bubblesForMessage(harness.turns, "m1")).toHaveLength(1);
    expect(harness.turns[0]?.id).toBe("hydrated-bound");
  });

  test("a turn-ANCHORED bubble that hydrates LATE is vetoed by the content fingerprint, NOT the id-gate", () => {
    // The round-6 freshly-created NL world: the reply settled with the turnId ANCHOR
    // (`sourceMessageId === "turn:t1"`, never the real backend id `m1`), because the room
    // was undefined at settle time. On reload the bound (anchored) bubble hydrates a
    // render LATE, so the gate seed snapshots EMPTY. When the bubble lands its seeded id
    // is "turn:t1" — which NEVER matches the posted message id `m1`, so the id-gate is
    // POWERLESS here. ONLY the per-render content-fingerprint self-heal can veto the
    // re-fold: it puts the bubble's `speaker::foldedText` into the gate the instant it
    // lands, so the posted-fold effect (still reading the stale empty snapshot) is blocked
    // by content. Without the fingerprint gate this re-folds a SECOND bubble.
    const anchoredBubble: ChatTurn = {
      card: {
        detail: "我已闭关三日，今日方出。",
        kind: "run-turn",
        speakerName: "顾辰风",
        streaming: false,
        variant: "role-speech",
      },
      id: "hydrated-anchored",
      role: "system",
      sourceMessageId: "turn:t1", // the synthetic anchor — NOT the backend id m1
      text: "",
    };
    const harness = makeHarness({
      deliverMessagesLate: true,
      hydrateTurnsLate: true,
      hydratedTurns: [anchoredBubble],
      messages: [message],
    });

    harness.render();
    harness.render();
    harness.deliverTurns();
    harness.deliverMessages();
    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    // EXACTLY ONE bubble — the persisted anchored one; the fingerprint self-heal vetoed
    // the re-fold even though the id-gate's seeded "turn:t1" never matched m1.
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(1);
    expect(harness.turns[0]?.id).toBe("hydrated-anchored");
  });

  test("freshly-created NL world: anchored id-less reply + room late, reload ×N stays ONE bubble in slot", () => {
    // The round-6 reload ACCUMULATION loop. A brand-new NL world ran run-turn while
    // `selectedRoom.id` was still undefined, so the streamed reply found NO posted twin
    // and settled with the turnId ANCHOR (`sourceMessageId === "turn:t1"`, never the
    // real backend id). It sits between an operator line and a set-rule card (so a blind
    // tail-append would strand a re-fold BELOW the set-rule card — the out-of-order
    // symptom the verifier saw). On reload `app.state.messages` AND the room both arrive
    // LATE. Because the bubble is ANCHORED (not id-less), the reconcile SKIPS it; and the
    // id-gate seed holds only "turn:t1", which never matches the real message id. So the
    // CONTENT FINGERPRINT is the SOLE guard — and it vetoes the re-fold on every reload
    // pass, yielding EXACTLY ONE role-speech bubble in its original slot, no matter how
    // many times the world is reloaded.
    const replyText = "我已闭关三日，今日方出。";
    const lateMessage = postedMsg("m-late", "guchenfeng", replyText);
    const operatorTurn: ChatTurn = { id: "op-1", role: "operator", text: "让顾辰风发言" };
    const setRuleCard: ChatTurn = {
      card: {
        detail: "已为世界设定规则。",
        kind: "state-patch",
        title: "规则已生效",
        variant: "result",
      },
      id: "rule-1",
      role: "system",
      text: "",
    };
    // The persisted bubble carries the round-6 turn ANCHOR — NOT the backend message id.
    // This is exactly what `settleRunTurn` now writes when the room is absent at settle.
    const anchoredReply: ChatTurn = {
      card: {
        detail: replyText,
        kind: "run-turn",
        speakerName: "顾辰风",
        streaming: false,
        variant: "role-speech",
      },
      id: "reply-anchored",
      role: "system",
      sourceMessageId: "turn:t1",
      text: "",
    };

    function runReload(): { count: number; speechIndex: number; ruleIndex: number } {
      const harness = makeHarness({
        deliverMessagesLate: true,
        deliverRoomLate: true,
        // Original timeline order: operator → reply (in slot) → set-rule card.
        hydratedTurns: [operatorTurn, anchoredReply, setRuleCard],
        messages: [lateMessage],
      });
      // Pre-hydration renders: neither the message nor the room has landed yet.
      harness.render();
      harness.render();
      // The backend message + selected room land; the hydration re-render storm follows.
      harness.deliverMessages();
      harness.deliverRoom();
      for (let i = 0; i < 6; i += 1) {
        harness.render();
      }
      const speech = harness.turns.filter((turn) => turn.card?.variant === "role-speech");
      return {
        count: speech.length,
        ruleIndex: harness.turns.findIndex((turn) => turn.id === "rule-1"),
        speechIndex: harness.turns.findIndex((turn) => turn.card?.variant === "role-speech"),
      };
    }

    // Reload twice (the deterministic +1-per-reload symptom): both reloads must yield
    // EXACTLY ONE bubble, and it must stay ABOVE the set-rule card (original slot),
    // never stray-appended at the tail.
    const first = runReload();
    expect(first.count).toBe(1);
    expect(first.speechIndex).toBeLessThan(first.ruleIndex);

    const second = runReload();
    expect(second.count).toBe(1);
    expect(second.speechIndex).toBeLessThan(second.ruleIndex);
  });

  test("a GENUINELY new posted message still folds after reload (no over-suppression)", () => {
    // Seeding the gate from the hydrated bubble must NOT block a different, newly
    // arrived role line — only the already-rendered message id is suppressed.
    const hydratedBubble: ChatTurn = {
      ...roleSpeechPostedTurn(message, "顾辰风"),
      id: "hydrated-1",
    };
    const newMsg = postedMsg("m2", "guchenfeng", "我从洞府归来，欲论道一番。");
    const harness = makeHarness({
      hydratedTurns: [hydratedBubble],
      messages: [message, newMsg],
    });

    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    expect(bubblesForMessage(harness.turns, "m1")).toHaveLength(1);
    expect(bubblesForMessage(harness.turns, "m2")).toHaveLength(1);
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(2);
  });
});

describe("reload triple-render dedup — stream-settled + posted twin (P1)", () => {
  test("a settled bubble's posted twin is never re-folded across re-renders", () => {
    // The bubble settles from streamed text AND binds its posted twin's id; the
    // posted-fold effect must skip that id on every subsequent hydration re-render.
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");
    const harness = makeHarness({ messages: [message], streamed: "我已闭关三日，" });

    for (let i = 0; i < 5; i += 1) {
      harness.render();
    }

    const speech = harness.turns.filter((turn) => turn.card?.variant === "role-speech");
    expect(speech).toHaveLength(1);
    expect(speech[0]?.sourceMessageId).toBe("m1");
  });
});

/**
 * F2 — cross-world transcript bleed after an NL world-switch.
 *
 * BUG: switching worlds via "切换到赛博修真世界" from a populated cultivation world left
 * the PRIOR world's role bubbles (顾辰风 / 雷军) in the destination's 1-role transcript.
 * ROOT CAUSE: on switch `worldId` flips IMMEDIATELY, but the controller reloads
 * `app.state.messages`/`events` ASYNCHRONOUSLY (an awaited `loadRealm`), so for
 * SEVERAL transitional renders `messages` still describe the DEPARTING world while
 * `turns` already hold the destination's reloaded (empty) transcript. The posted-fold
 * + active-settle effects re-folded those stale departing-world lines into the new
 * world, and `foldedIdsRef` (a useRef) was never reset on world change.
 *
 * FIX (mirrored by `makeWorldScopedHarness`):
 *  - PRIMARY, race-proof: fold ONLY messages whose `message.worldId === worldId`
 *    (the active world). Every `Message` carries its own `worldId`, so a departing
 *    world's line is structurally excluded from fold candidates no matter how many
 *    transitional renders the async reload spans — closing the multi-render window
 *    the single-render bail alone could not.
 *  - SECONDARY hygiene: on a (worldId, identity) scope change reset `foldedIdsRef`,
 *    clear any in-flight `activeRunTurn` (it could only belong to the departing
 *    world), and skip both effects for that one transitional render.
 */

describe("world-switch transcript scoping (F2)", () => {
  test("a prior world's stale message is NOT re-folded into the new world across the async reload", () => {
    // Cultivation world: 顾辰风 spoke; that bubble was folded and is in the transcript.
    const priorMsg = postedMsg("c1", "guchenfeng", "我的看法是顺势而为。");
    const harness = makeWorldScopedHarness({
      messages: [priorMsg],
      worldId: "cultivation",
    });
    harness.render();
    expect(bubblesForMessage(harness.turns, "c1")).toHaveLength(1);

    // NL world-switch to cyber (赛博修真世界, a fresh 1-role world). `worldId` flips now;
    // persistence reloads `turns` to EMPTY. But the awaited `loadRealm` has not yet
    // landed, so `messages` STAY the departing cultivation line for MULTIPLE renders —
    // the exact multi-render stale window the live bug exploited.
    harness.switchWorld("cyber", []);
    harness.render(); // transitional bail (scope change)
    harness.render(); // reload still in flight: `messages` STILL the cultivation line
    harness.render(); // ...and again — the filter must keep excluding it every render

    // The cultivation line carries worldId "cultivation" ≠ active "cyber", so it is
    // never a fold candidate — no bleed regardless of how long the reload lags.
    expect(bubblesForMessage(harness.turns, "c1")).toHaveLength(0);
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(0);
  });

  test("the new world's OWN posted role message DOES fold once after the switch", () => {
    const priorMsg = postedMsg("c1", "guchenfeng", "我的看法是顺势而为。");
    const harness = makeWorldScopedHarness({
      messages: [priorMsg],
      worldId: "cultivation",
    });
    harness.render();

    // Switch; once `loadRealm` lands, the destination world posts its OWN role line
    // (worldId "cyber") which MUST fold exactly once — and the departing line, still
    // present in the message log, must remain excluded.
    const newMsg: Message = {
      ...postedMsg("y1", "guchenfeng", "云遥说：此界初开。"),
      worldId: "cyber",
    };
    harness.switchWorld("cyber", []);
    harness.render(); // transitional bail
    harness.setMessages([priorMsg, newMsg]); // reload landed: both worlds' lines in the log
    harness.render(); // only the cyber line folds
    harness.render(); // re-render storm: must not double-fold

    expect(bubblesForMessage(harness.turns, "c1")).toHaveLength(0);
    expect(bubblesForMessage(harness.turns, "y1")).toHaveLength(1);
    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(1);
  });

  test("an in-flight activeRunTurn from the departing world leaks no bubble", () => {
    // The departing 顾辰风 line is still in the message log post-switch (worldId
    // "cultivation"); an active run-turn settling against it must not resolve a bubble.
    const priorMsg = postedMsg("c1", "guchenfeng", "稳一手——先看清楚再说。");
    const harness = makeWorldScopedHarness({
      messages: [priorMsg],
      worldId: "cultivation",
    });
    harness.render();
    // A run-turn for 顾辰风 was kicked off in cultivation and is mid-flight at switch.
    // Its settle must NOT materialize a bubble in the destination world: the scope
    // change clears the handle AND the departing line is filtered out of `messages`.
    harness.startRunTurn("顾辰风", "");
    harness.switchWorld("cyber", []);
    harness.render(); // transitional bail clears the active handle
    harness.render(); // destination render: nothing in-scope to settle

    expect(harness.turns.filter((turn) => turn.card?.variant === "role-speech")).toHaveLength(0);
  });
});
