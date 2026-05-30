import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import {
  appendCarryOver,
  loadTranscript,
  saveTranscript,
} from "@/state/god-chat-transcript-store.ts";
import {
  buildWorldSwitchCarryOver,
  parseScopeKey,
  transcriptScopeKey,
  type WorldSwitchCarryOver,
} from "@/state/use-god-chat-helpers.ts";

/**
 * F6 — durable God-chat transcript persistence, split out of `use-god-chat.ts`
 * so that file stays under the 500-line guard.
 *
 * Two effects mirror `turns` to localStorage keyed by (worldId, identity)
 * WITHOUT racing the transcript-sync hook (which only ever APPENDS folded role
 * speech): persistence merely OBSERVES `turns` and, on a scope SWITCH, REPLACES
 * them with that scope's saved history (flushing the departing scope first so its
 * tail is never lost). It never re-derives fold/settle logic, so it is a
 * downstream sink of the already-folded transcript, not a second author of it.
 *
 * The hook owns `turns` (so its lazy initializer can restore the INITIAL scope);
 * this companion handles every scope change after mount plus the debounced
 * write-back. `turnsRef` is the hook's always-current mirror, read during a scope
 * flush so the departing scope's latest turns survive without making `turns` a
 * dependency of the scope-load effect (which would reload mid-conversation).
 */
export function useGodChatTranscriptPersistence(input: {
  worldId: string | undefined;
  identity: string;
  turns: ChatTurn[];
  turnsRef: { current: ChatTurn[] };
  setTurns: Dispatch<SetStateAction<ChatTurn[]>>;
  // F2 — a chat-initiated world switch stashes the operator's live "切换到…" line +
  // result-card data here; when the scope swap fires we splice those turns onto the
  // destination's restored transcript so the switch is one continuous turn (instead
  // of dropping the in-flight bubble + showing a stale destination-scope label).
  switchCarryOverRef: MutableRefObject<WorldSwitchCarryOver | undefined>;
  // Mints turn ids for the carried-over turns, so the hook stays the sole authority
  // on id generation and the carry-over ids never collide with live turns.
  nextTurnId: () => string;
}): void {
  const { worldId, identity, turns, turnsRef, setTurns, switchCarryOverRef, nextTurnId } = input;
  const scopeRef = useRef(transcriptScopeKey(worldId, identity));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load the target scope's history on a world/identity switch. The hook's lazy
  // state initializer already loaded the initial scope, so the first run no-ops.
  // Scope identity is the only trigger — `turns`/refs/setters are deliberately not
  // deps, so an append never reloads mid-conversation.
  useEffect(() => {
    const nextScope = transcriptScopeKey(worldId, identity);
    if (nextScope === scopeRef.current) {
      return;
    }
    // Flush the departing scope synchronously (the debounce may not have fired).
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    const [prevWorldId, prevIdentity] = parseScopeKey(scopeRef.current);
    saveTranscript(prevWorldId, prevIdentity, turnsRef.current);
    scopeRef.current = nextScope;
    // F2 — when a chat-initiated world switch is in flight, do NOT blindly replace
    // `turns` with the destination's saved history (which would drop the operator's
    // just-typed "切换到…" bubble + the switch result card). Instead APPEND those
    // carry-over turns onto the destination's restored transcript so the switch is
    // one continuous conversation across worlds. The bubble carries the LIVE typed
    // text, so the green operator bubble never shows a stale destination label.
    const restored = loadTranscript(worldId, identity);
    const carry = switchCarryOverRef.current;
    if (carry) {
      switchCarryOverRef.current = undefined;
      setTurns(appendCarryOver(restored, buildWorldSwitchCarryOver(carry, nextTurnId)));
    } else {
      setTurns(restored);
    }
  }, [worldId, identity, turnsRef, setTurns, switchCarryOverRef, nextTurnId]);

  // Debounced write-back: coalesce one command's rapid appends into a single persist.
  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      saveTranscript(worldId, identity, turns);
    }, 250);
    return () => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    };
  }, [turns, worldId, identity]);
}
