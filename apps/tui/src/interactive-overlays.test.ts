import { describe, expect, test } from "bun:test";
import type { Component, OverlayOptions } from "@earendil-works/pi-tui";
import { hideOverlayIfPresent, type OverlayHost, replaceOverlay } from "./interactive-overlays.ts";

describe("TUI interactive overlays", () => {
  test("replaces overlays instead of stacking them", () => {
    const calls: string[] = [];
    const host: OverlayHost = {
      hideOverlay: () => calls.push("hide"),
      requestRender: (force) => calls.push(`render:${String(force)}`),
      showOverlay: () => calls.push("show"),
    };

    replaceOverlay(host, {} as Component, { anchor: "center" } as OverlayOptions);

    expect(calls).toEqual(["hide", "render:true", "show"]);
  });

  test("closing a missing overlay is harmless", () => {
    const calls: string[] = [];

    hideOverlayIfPresent({
      hideOverlay: () => {
        calls.push("hide");
        throw new Error("no overlay");
      },
      requestRender: () => calls.push("render"),
    });

    expect(calls).toEqual(["hide"]);
  });
});
