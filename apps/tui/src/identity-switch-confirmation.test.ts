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
    expect(formatIdentitySwitchConfirmation(pending, tuiDictionaries.en)).toContain(
      "real operator remains Boss",
    );
    expect(decideIdentitySwitchConfirmation("y")).toBe("confirm");
    expect(decideIdentitySwitchConfirmation("cancel")).toBe("cancel");
    expect(decideIdentitySwitchConfirmation("maybe")).toBe("pending");
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
