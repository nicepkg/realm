import type { Component, OverlayOptions } from "@earendil-works/pi-tui";

export type OverlayHost = {
  hideOverlay: () => void;
  requestRender: (force?: boolean) => void;
  showOverlay: (overlay: Component, options?: OverlayOptions) => unknown;
};

export function hideOverlayIfPresent(tui: Pick<OverlayHost, "hideOverlay" | "requestRender">) {
  try {
    tui.hideOverlay();
    tui.requestRender(true);
  } catch {
    // Some pi-tui versions throw when no overlay is mounted.
  }
}

export function replaceOverlay(
  tui: OverlayHost,
  overlay: Component,
  options?: OverlayOptions,
): void {
  hideOverlayIfPresent(tui);
  tui.showOverlay(overlay, options);
}
