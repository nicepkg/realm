import { describe, expect, test } from "bun:test";
import {
  createIdentitySwitchConfirmation,
  decideIdentitySwitchConfirmation,
  formatIdentitySwitchConfirmation,
} from "./identity-switch-confirmation.ts";

describe("TUI identity switch confirmation", () => {
  test("requires confirmation for role identity switches", () => {
    const pending = createIdentitySwitchConfirmation("leijun", [
      { id: "leijun", displayName: "Lei Jun", model: "default", source: "config" },
    ]);

    expect(pending).toEqual({ identity: "leijun", identityLabel: "Lei Jun" });
    if (!pending) {
      throw new Error("expected pending identity switch");
    }
    expect(formatIdentitySwitchConfirmation(pending)).toContain("real operator remains Boss");
    expect(decideIdentitySwitchConfirmation("y")).toBe("confirm");
    expect(decideIdentitySwitchConfirmation("cancel")).toBe("cancel");
    expect(decideIdentitySwitchConfirmation("maybe")).toBe("pending");
    expect(createIdentitySwitchConfirmation("owner", [])).toBeUndefined();
  });
});
