import { describe, expect, test } from "bun:test";
import type { StatePatchResult } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/i18n/index.tsx";
import { GodResultPanel } from "./workspace-sheets.tsx";

function committedResult(): StatePatchResult {
  return {
    patchId: "patch-abc-123",
    status: "committed",
    version: 8,
  } as unknown as StatePatchResult;
}

describe("GodResultPanel", () => {
  test("demotes the patch id to a monospace caption with a copy affordance", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <GodResultPanel result={committedResult()} />
      </I18nProvider>,
    );

    // The patch id is reference metadata: it now reads as a quiet <code>
    // caption with a copy button, not a primary full-width readonly input.
    expect(html).toContain('data-testid="god-result-patch-id"');
    expect(html).toContain('data-testid="god-result-patch-id-copy"');
    expect(html).toContain("patch-abc-123");
    expect(html).toContain("<code");
    // No full-width readonly Input chrome around the patch id anymore.
    expect(html).not.toContain('readonly=""');
  });

  test("keeps both recovery affordances disabled (no real reverse path exists)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <GodResultPanel result={committedResult()} />
      </I18nProvider>,
    );

    const rollback = html.indexOf('data-testid="god-rollback"');
    const obsolete = html.indexOf('data-testid="god-mark-obsolete"');
    expect(rollback).toBeGreaterThan(-1);
    expect(obsolete).toBeGreaterThan(-1);
    // Both buttons render with the disabled attribute.
    expect(html.slice(rollback, rollback + 120)).toContain("disabled");
    expect(html.slice(obsolete, obsolete + 120)).toContain("disabled");
  });
});
