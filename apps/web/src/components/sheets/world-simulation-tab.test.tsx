import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { consequenceCopy, WorldSimulationTab } from "./world-simulation-tab.tsx";

describe("world simulation tab gating copy", () => {
  test("zh-CN run consequence names the world, the tick count, and irreversibility", () => {
    const copy = consequenceCopy["zh-CN"];
    expect(copy.runBody("修仙世界", 5)).toContain("修仙世界");
    expect(copy.runBody("修仙世界", 5)).toContain("5");
    expect(copy.runBody("修仙世界", 5)).toContain("无法自动撤销");
    expect(copy.irreversible).toContain("无法自动撤销");
  });

  test("zh-CN fork consequence names the branch label", () => {
    expect(consequenceCopy["zh-CN"].forkBody("分支一")).toContain("分支一");
  });

  test("en run consequence states it cannot be undone", () => {
    const copy = consequenceCopy.en;
    expect(copy.runBody("Cultivation", 3)).toContain("Cultivation");
    expect(copy.runBody("Cultivation", 3)).toContain("3");
    expect(copy.runBody("Cultivation", 3)).toContain("cannot be automatically undone");
    expect(copy.irreversible).toContain("cannot");
  });

  test("the default single tick still produces a full consequence sentence", () => {
    // ticks === 1 is the most reachable Run Ticks and now routes through the
    // gate, so its consequence copy must name the world and state irreversibility.
    expect(consequenceCopy["zh-CN"].runBody("修仙世界", 1)).toContain("修仙世界");
    expect(consequenceCopy["zh-CN"].runBody("修仙世界", 1)).toContain("1");
    expect(consequenceCopy["zh-CN"].runBody("修仙世界", 1)).toContain("无法自动撤销");
    expect(consequenceCopy.en.runBody("Cultivation", 1)).toContain(
      "cannot be automatically undone",
    );
  });

  test("outcome notices report the clock/event delta and fork label", () => {
    expect(consequenceCopy["zh-CN"].runNotice(12, 4)).toContain("12");
    expect(consequenceCopy["zh-CN"].runNotice(12, 4)).toContain("4");
    expect(consequenceCopy["zh-CN"].forkNotice("分支一")).toContain("分支一");
  });
});

describe("world simulation tab render", () => {
  test("run ticks renders at calm secondary weight and no confirm/outcome on first paint", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WorldSimulationTab app={mockApp()} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="world-simulation-tab"');
    // Run Ticks must not be the full-strength green primary button. Capture the
    // whole <button> opening tag (attribute order is not stable across props).
    const runButton = html.match(/<button[^>]*data-testid="sim-run-ticks"[^>]*>/)?.[0] ?? "";
    expect(runButton).toContain('data-variant="secondary"');
    expect(runButton).not.toContain('data-variant="default"');
    // The confirm dialog and outcome notice are not present until an action.
    expect(html).not.toContain('data-testid="sim-confirm-accept"');
    expect(html).not.toContain('data-testid="sim-outcome"');
  });
});

function mockApp(): RealmAppController {
  return {
    selectedWorld: { id: "cultivation", name: "Cultivation Sim" },
    client: {
      simulation: {
        getStatus: async () => ({
          worldId: "cultivation",
          paused: false,
          tick: 0,
          activeRuns: [],
        }),
      },
    },
  } as unknown as RealmAppController;
}
