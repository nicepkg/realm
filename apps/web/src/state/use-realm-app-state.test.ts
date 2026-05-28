import { describe, expect, test } from "bun:test";
import { resolveIdentityAfterRealmLoad } from "./use-realm-app-state.ts";

describe("realm app state identity safety", () => {
  test("forces Boss identity after an explicit world switch", () => {
    expect(resolveIdentityAfterRealmLoad("leijun", ["owner", "leijun"], true)).toBe("owner");
  });

  test("preserves an in-world takeover when reloading the same world", () => {
    expect(resolveIdentityAfterRealmLoad("leijun", ["owner", "leijun"], false)).toBe("leijun");
  });

  test("falls back to Boss when a stale identity is no longer configured", () => {
    expect(resolveIdentityAfterRealmLoad("removed-role", ["owner", "leijun"], false)).toBe("owner");
  });

  test("does not keep God as a normal composer identity", () => {
    expect(resolveIdentityAfterRealmLoad("god", ["owner", "leijun"], false)).toBe("owner");
  });
});
