import { describe, expect, test } from "bun:test";
import type { StatePatchResult } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/i18n/index.tsx";
import { GodResultPanel } from "./god-sheet.tsx";

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
    expect(html).not.toContain('readonly=""');
  });

  test("offers a LIVE undo for a committed kill targeting the ruled role", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <GodResultPanel
          result={committedResult()}
          appliedAction="kill"
          targetRoleId="rival"
          onUndo={() => {}}
        />
      </I18nProvider>,
    );

    const rollback = html.indexOf('data-testid="god-rollback"');
    expect(rollback).toBeGreaterThan(-1);
    // The undo button is enabled (it routes through the gate), never a dead
    // disabled control.
    expect(html.slice(rollback, rollback + 160)).not.toContain("disabled");
  });

  test("hides undo when the committed ruling was a revive (nothing to undo)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <GodResultPanel
          result={committedResult()}
          appliedAction="revive"
          targetRoleId="rival"
          onUndo={() => {}}
        />
      </I18nProvider>,
    );

    expect(html).not.toContain('data-testid="god-rollback"');
  });

  test("replaces the dead mark-obsolete button with a prose recovery model note", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <GodResultPanel result={committedResult()} />
      </I18nProvider>,
    );

    // No interactive obsolete button anymore — only a quiet caption.
    expect(html).not.toContain('data-testid="god-mark-obsolete"');
    expect(html).toContain('data-testid="god-obsolete-note"');
  });
});
