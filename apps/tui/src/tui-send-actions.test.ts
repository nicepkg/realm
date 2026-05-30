import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary } from "./i18n.ts";
import { tuiEn } from "./i18n-en.ts";
import { tuiZhCn } from "./i18n-zh-cn.ts";
import {
  isReadOnlyGateError,
  sendWithDraftOnFailure,
  withReadOnlyHint,
} from "./tui-send-actions.ts";
import type { TuiState } from "./types.ts";

// The exact reason string the policy gate throws under read-only trust.
const READ_ONLY_ERROR =
  "Project is trusted for read-only inspection only. Raise the project trust tier to run roles or elevated tools.";

function stateFixture(): TuiState {
  return {
    projectName: "云岭修仙界",
    worlds: [],
    world: { id: "cultivation", name: "云岭修仙界" } as unknown as TuiState["world"],
    rooms: [],
    room: { id: "main", name: "全员议事" } as unknown as TuiState["room"],
    roles: [],
    messages: [],
    events: [],
    identity: "owner",
  };
}

/** Fake client whose sendMessage always fails with the supplied error. */
function failingClient(error: Error): RealmHttpClient {
  return {
    sendMessage: async () => {
      throw error;
    },
  } as unknown as RealmHttpClient;
}

describe("read-only gate detection", () => {
  test("recognizes the policy gate read-only denial", () => {
    expect(isReadOnlyGateError(READ_ONLY_ERROR)).toBe(true);
    // Case-insensitive so a wrapped/normalized message still matches.
    expect(isReadOnlyGateError(READ_ONLY_ERROR.toUpperCase())).toBe(true);
    expect(isReadOnlyGateError("network timeout")).toBe(false);
  });

  test("appends the localized hint only for read-only failures", () => {
    expect(withReadOnlyHint("Saved.", READ_ONLY_ERROR, tuiEn)).toContain(tuiEn.trustReadOnlyHint);
    expect(withReadOnlyHint("已保存。", READ_ONLY_ERROR, tuiZhCn)).toContain(
      tuiZhCn.trustReadOnlyHint,
    );
    // A non-gate failure keeps the original notice untouched.
    expect(withReadOnlyHint("Saved.", "boom", tuiEn)).toBe("Saved.");
  });
});

describe("sendWithDraftOnFailure read-only hint", () => {
  let draftsDir: string;
  beforeAll(async () => {
    draftsDir = await mkdtemp(path.join(os.tmpdir(), "realm-tui-send-test-"));
  });
  afterAll(async () => {
    await rm(draftsDir, { force: true, recursive: true });
  });

  test("read-only send saves a draft AND surfaces the elevation hint", async () => {
    let thrown: Error | undefined;
    try {
      await sendWithDraftOnFailure(
        failingClient(new Error(READ_ONLY_ERROR)),
        stateFixture(),
        "blocked message",
        draftsDir,
        tuiEn satisfies TuiDictionary,
      );
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    // Draft is still saved (operator keeps their text) and the hint points to
    // elevation instead of dead-ending on the raw gate error.
    expect(thrown?.message).toContain("Draft");
    expect(thrown?.message).toContain(tuiEn.trustReadOnlyHint);
  });

  test("non-gate failure keeps the plain draft notice without a trust hint", async () => {
    let thrown: Error | undefined;
    try {
      await sendWithDraftOnFailure(
        failingClient(new Error("provider exploded")),
        stateFixture(),
        "another message",
        draftsDir,
        tuiEn satisfies TuiDictionary,
      );
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown?.message).toContain("Draft");
    expect(thrown?.message).not.toContain(tuiEn.trustReadOnlyHint);
  });
});
