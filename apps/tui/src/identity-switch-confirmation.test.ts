import { describe, expect, test } from "bun:test";
import { tuiDictionaries } from "./i18n.ts";
import {
  createIdentitySwitchConfirmation,
  decideIdentitySwitchConfirmation,
  formatIdentitySwitchConfirmation,
} from "./identity-switch-confirmation.ts";

describe("TUI identity switch confirmation", () => {
  const roles = [
    { id: "leijun", displayName: "Lei Jun", model: "default", source: "config" as const },
  ];

  test("requires confirmation for role identity switches (en)", () => {
    const pending = createIdentitySwitchConfirmation("leijun", roles);

    expect(pending).toEqual({ identity: "leijun", identityLabel: "Lei Jun" });
    if (!pending) {
      throw new Error("expected pending identity switch");
    }
    const summary = formatIdentitySwitchConfirmation(pending, tuiDictionaries.en);
    expect(summary).toContain("real operator remains Boss");
    expect(summary).toContain("Type leijun to confirm");
    // A bare affirmation must NOT commit a dangerous identity takeover by
    // accidental Enter — only typing the exact role id confirms.
    expect(decideIdentitySwitchConfirmation("y", pending)).toBe("pending");
    expect(decideIdentitySwitchConfirmation("yes", pending)).toBe("pending");
    expect(decideIdentitySwitchConfirmation("confirm", pending)).toBe("pending");
    expect(decideIdentitySwitchConfirmation("yes do it", pending)).toBe("pending");
    expect(decideIdentitySwitchConfirmation("leijun", pending)).toBe("confirm");
    expect(decideIdentitySwitchConfirmation("cancel", pending)).toBe("cancel");
    expect(decideIdentitySwitchConfirmation("n", pending)).toBe("cancel");
    expect(decideIdentitySwitchConfirmation("maybe", pending)).toBe("pending");
    expect(createIdentitySwitchConfirmation("owner", [])).toBeUndefined();
  });

  test("renders confirmation in zh-CN from the dictionary", () => {
    const pending = createIdentitySwitchConfirmation("leijun", roles);
    if (!pending) {
      throw new Error("expected pending identity switch");
    }
    const summary = formatIdentitySwitchConfirmation(pending, tuiDictionaries["zh-CN"]);
    expect(summary).toContain("真实操作者仍为 Boss");
    expect(summary).not.toContain("real operator remains Boss");
  });
});
