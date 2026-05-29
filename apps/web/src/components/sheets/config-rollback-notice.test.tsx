import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/i18n/index.tsx";
import type { AppliedConfigPatch } from "./config-action-types.ts";
import { ConfigRollbackNotice } from "./config-rollback-notice.tsx";

function render(patch?: AppliedConfigPatch): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <ConfigRollbackNotice
        patch={patch}
        onDismiss={() => {}}
        onRollback={async () => ({ historyId: patch?.historyId ?? "", restoredPaths: [] })}
      />
    </I18nProvider>,
  );
}

const patch: AppliedConfigPatch = {
  changedPaths: ["worlds/demo/world.yaml", "worlds/demo/roles/sage.yaml"],
  historyId: "h-1",
  patchId: "p-1",
  summary: "应用了新世界配置",
  title: "新建世界：青云门",
};

describe("config rollback notice", () => {
  test("renders nothing without a patch", () => {
    expect(render(undefined)).toBe("");
  });

  test("renders the rollback affordance visibly (not sr-only)", () => {
    const html = render(patch);
    // The notice root and its primary body must be visible (the only sr-only
    // node allowed is the supplementary help span at the very end).
    expect(html).toContain('data-testid="config-rollback-notice"');
    expect(html).toMatch(/<aside[^>]*data-testid="config-rollback-notice"[^>]*>/);
    expect(html).not.toMatch(/<aside[^>]*class="[^"]*sr-only/);
    expect(html.match(/sr-only/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(html).toContain(patch.title);
    expect(html).toContain(patch.changedPaths.join(", "));
    expect(html).toContain('data-testid="config-rollback-notice-action"');
    expect(html).toContain('data-testid="config-rollback-notice-dismiss"');
  });

  test("anchors to the bottom of the viewport without clipping at the edge", () => {
    const html = render(patch);
    expect(html).toContain("fixed");
    expect(html).toContain("bottom-3");
    // Right-side breathing room on desktop so the card never clips the edge.
    expect(html).toContain("sm:right-5");
  });
});
