import { describe, expect, test } from "bun:test";
import type { AuditEntry } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { WorldAuditTimeline } from "./world-audit-timeline.tsx";

/**
 * On the first synchronous paint (before listAudits resolves) the timeline must
 * show its loading placeholders — never the "暂无审计" empty state. This guards
 * against the original bug where `audits` defaulted to [] and rendered the empty
 * message as if the fetch had succeeded.
 */
describe("world audit timeline", () => {
  test("renders the loading state on first paint, not a false empty state", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WorldAuditTimeline app={mockApp(() => new Promise(() => {})) as RealmAppController} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="world-audit-loading"');
    // zh-CN is the default locale; "暂无审计" must not appear while loading.
    expect(html).not.toContain("暂无审计");
    expect(html).not.toContain('data-testid="world-audit-error"');
  });

  test("keeps the denials filter buttons available alongside async states", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WorldAuditTimeline app={mockApp(() => new Promise(() => {})) as RealmAppController} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="audit-filter-all"');
    expect(html).toContain('data-testid="audit-filter-denials"');
  });
});

function mockApp(listAudits: () => Promise<{ audits: AuditEntry[] }>): Partial<RealmAppController> {
  return {
    client: { listAudits } as unknown as RealmAppController["client"],
    selectedWorld: { id: "cultivation" } as RealmAppController["selectedWorld"],
  };
}
