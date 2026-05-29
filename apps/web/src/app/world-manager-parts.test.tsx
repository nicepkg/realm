import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n/index.tsx";
import { QuickStart } from "./world-manager-parts.tsx";

function renderQuickStart(worldCount: number): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <TooltipProvider>
        <QuickStart
          onAddRole={() => {}}
          onCreateWorld={() => {}}
          onEnterRoom={() => {}}
          worldCount={worldCount}
        />
      </TooltipProvider>
    </I18nProvider>,
  );
}

describe("QuickStart", () => {
  test("renders all three distinct steps", () => {
    const html = renderQuickStart(2);
    expect(html).toContain('data-testid="quick-start-create-world"');
    expect(html).toContain('data-testid="quick-start-add-role"');
    expect(html).toContain('data-testid="quick-start-enter-room"');
  });

  test("enter-room is actionable once worlds exist (DISC-3)", () => {
    const html = renderQuickStart(1);
    // The enter-room button must not be disabled when a world is present.
    const enterRoom = html.slice(html.indexOf('data-testid="quick-start-enter-room"'));
    const buttonTag = enterRoom.slice(0, enterRoom.indexOf(">"));
    expect(buttonTag).not.toContain("disabled");
  });

  test("enter-room is disabled-with-hint at zero worlds, not aliased to create (DISC-3)", () => {
    const html = renderQuickStart(0);
    const enterRoom = html.slice(html.indexOf('data-testid="quick-start-enter-room"'));
    const buttonTag = enterRoom.slice(0, enterRoom.indexOf(">"));
    expect(buttonTag).toContain("disabled");
  });
});
