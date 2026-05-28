import { describe, expect, test } from "bun:test";
import { buildSubprocessEnv, defaultApiKeyResolver } from "./index.ts";

describe("Pi bridge environment hermeticity", () => {
  test("does not read ambient API keys when explicit package env is supplied", () => {
    withAmbientOpenAiKey("ambient-secret", () => {
      const resolver = defaultApiKeyResolver({});

      expect(resolver("openai")).toBeUndefined();
    });
  });

  test("does not leak ambient API keys into explicit subprocess env", () => {
    withAmbientOpenAiKey("ambient-secret", () => {
      const env = buildSubprocessEnv({ REALM_EXTENSION_TOKEN: "token" }, undefined);

      expect(env.REALM_EXTENSION_TOKEN).toBe("token");
      expect(env.OPENAI_API_KEY).toBeUndefined();
    });
  });
});

function withAmbientOpenAiKey(value: string, run: () => void): void {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = value;
  try {
    run();
  } finally {
    if (original === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = original;
    }
  }
}
