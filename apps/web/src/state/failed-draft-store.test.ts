import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { failedDraftKey, rehydrateFailedDraft, stashFailedDraft } from "./failed-draft-store.ts";
import type { SendError } from "./realm-app-state-model.ts";

function failure(overrides: Partial<SendError> = {}): SendError {
  return {
    displayedAuthorId: "leijun",
    draft: "未发出的消息",
    message: "network down",
    pendingId: "pending-1",
    roomId: "main",
    worldId: "cultivation",
    ...overrides,
  };
}

/** Minimal in-memory `localStorage` stub mirroring the Web Storage contract. */
function installStorageStub(): { teardown: () => void } {
  const data = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
  (globalThis as { localStorage?: Storage }).localStorage = stub;
  return {
    teardown: () => {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    },
  };
}

describe("failed-draft localStorage persistence (survives reload/crash)", () => {
  let storage: { teardown: () => void };

  beforeEach(() => {
    storage = installStorageStub();
  });

  afterEach(() => {
    storage.teardown();
  });

  test("a stashed draft is recovered after a simulated reload (fresh empty map)", () => {
    // Author fails to send, navigation stashes the draft (write-through to disk).
    stashFailedDraft(new Map(), failure());

    // Simulate a reload/crash: the in-memory cache is gone, the hook re-inits
    // with `new Map()`, but the persisted slot must survive.
    const afterReload = new Map<string, string>();
    const recovered = rehydrateFailedDraft(afterReload, {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(recovered.draft).toBe("未发出的消息");

    // Consumed on recovery: a second post-reload visit finds nothing.
    const again = rehydrateFailedDraft(new Map(), {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(again.draft).toBeUndefined();
  });

  test("does not leak a persisted draft into another room or identity after reload", () => {
    stashFailedDraft(new Map(), failure());

    const wrongRoom = rehydrateFailedDraft(new Map(), {
      currentDraft: "",
      identity: "leijun",
      roomId: "side",
      worldId: "cultivation",
    });
    expect(wrongRoom.draft).toBeUndefined();

    const wrongIdentity = rehydrateFailedDraft(new Map(), {
      currentDraft: "",
      identity: "owner",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(wrongIdentity.draft).toBeUndefined();
  });

  test("in-progress composer edit is never clobbered by a persisted draft", () => {
    stashFailedDraft(new Map(), failure());
    const result = rehydrateFailedDraft(new Map(), {
      currentDraft: "正在输入",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(result.draft).toBeUndefined();
    // The slot is preserved for a later empty-composer visit.
    const later = rehydrateFailedDraft(new Map(), {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(later.draft).toBe("未发出的消息");
  });

  test("in-memory cache stays a read-through fast path alongside persistence", () => {
    // No reload here: the same map reference should still carry the entry, and
    // consuming it removes both the cache entry and the persisted slot.
    const stashed = stashFailedDraft(new Map(), failure());
    expect(stashed.get(failedDraftKey("cultivation", "main", "leijun"))).toBe("未发出的消息");

    const recovered = rehydrateFailedDraft(stashed, {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(recovered.draft).toBe("未发出的消息");
    expect(recovered.store.has(failedDraftKey("cultivation", "main", "leijun"))).toBe(false);

    // Persisted slot was cleared too — a post-reload visit finds nothing.
    const afterReload = rehydrateFailedDraft(new Map(), {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(afterReload.draft).toBeUndefined();
  });

  test("whitespace-only drafts are not persisted", () => {
    stashFailedDraft(new Map(), failure({ draft: "   \n  " }));
    const recovered = rehydrateFailedDraft(new Map(), {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(recovered.draft).toBeUndefined();
  });
});

describe("failed-draft store without localStorage (SSR / tests)", () => {
  test("stash + same-reference rehydrate still work via the in-memory map", () => {
    // No storage stub installed: `typeof localStorage === "undefined"`.
    const stashed = stashFailedDraft(new Map(), failure());
    const recovered = rehydrateFailedDraft(stashed, {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(recovered.draft).toBe("未发出的消息");
  });
});
