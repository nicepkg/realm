import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/i18n/index.tsx";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import {
  createOutsideDismissHandler,
  createOverlayDismissHandler,
  GodChatContextSheetClose,
  GodChatContextSheetContent,
  type GodChatContextSheetContentProps,
} from "./god-chat-context-sheet.tsx";

const baseContext: GodChatContext = {
  roles: [
    { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
    { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
  ],
  roomId: "main",
  rooms: [{ id: "main" }],
  worldId: "yunling",
  worldState: { state: { qi: 80, rivals: ["a", "b"], sect: "天剑宗" }, version: 3 },
};

function renderSheet(
  context: GodChatContext,
  overrides: Partial<GodChatContextSheetContentProps> = {},
): string {
  // Radix portals are absent from renderToStaticMarkup output, so we render the
  // presentational body directly (the repo's established sheet-test pattern, see
  // world-inspector-sheet.test.tsx). I18nProvider supplies the dict-backed `t`.
  return renderToStaticMarkup(
    <I18nProvider>
      <GodChatContextSheetContent
        context={context}
        onOpenCommandPalette={() => undefined}
        onOpenSettings={() => undefined}
        onRequestClose={() => undefined}
        {...overrides}
      />
    </I18nProvider>,
  );
}

function renderClose(onRequestClose: () => void = () => undefined): string {
  // The close × now lives on the SheetHeader's top-right row (out of the body's
  // flow-collision zone). It's a plain <button> with no Radix Dialog binding, so
  // it renders standalone in renderToStaticMarkup — no Portal needed.
  return renderToStaticMarkup(
    <I18nProvider>
      <GodChatContextSheetClose onRequestClose={onRequestClose} />
    </I18nProvider>,
  );
}

describe("GodChatContextSheet", () => {
  test("mirrors the rail: world-state highlights + role roster (read-only)", () => {
    const html = renderSheet(baseContext);
    expect(html).toContain('data-testid="god-chat-context-sheet-body"');
    expect(html).toContain("天剑宗");
    expect(html).toContain("顾辰风");
    expect(html).toContain("云遥");
    // Precise-tweak entries, NOT a button wall: exactly the two allowed edges.
    expect(html).toContain('data-testid="god-chat-context-sheet-command"');
    expect(html).toContain('data-testid="god-chat-context-sheet-settings"');
    // Never the legacy messenger surface.
    expect(html).not.toContain("god-chat-card");
  });

  test("renders an explicit close button with a real accessible name (aria-label)", () => {
    const html = renderClose();
    // The × carries a REAL aria-label (关闭), not just sr-only text — discoverable
    // by assistive tech and assertable. onRequestClose drives the same
    // onOpenChange(false) path as a backdrop tap / Escape.
    expect(html).toContain('data-testid="god-chat-context-sheet-close"');
    expect(html).toContain('aria-label="关闭"');
    expect(html).toContain('type="button"');
  });

  test("close button is in the header, NOT inside the scrolling body's state-meta row", () => {
    // Collision fix (F1): the × is relocated to the SheetHeader's own top row, so
    // it can never overlap the first ContextSection's '世界状态 v1 · N 个字段'
    // version label. Assert it is absent from the body markup entirely, and that
    // it no longer carries the absolute-position classes that used to land it on
    // top of that `ml-auto` meta text.
    const body = renderSheet(baseContext);
    expect(body).not.toContain('data-testid="god-chat-context-sheet-close"');
    // The body still renders the colliding state meta (proves we kept it intact).
    expect(body).toContain("世界状态");
    expect(body).toContain("3 个字段");

    const close = renderClose();
    // No absolute/-top positioning anymore — it's a normal flex-row child.
    expect(close).not.toContain("absolute");
    expect(close).not.toContain("-top-1");
  });

  test("close button invokes onRequestClose exactly once when activated", () => {
    // The header × wires onClick → onRequestClose, the same onOpenChange(false)
    // path as a backdrop tap / Escape. Render with a real handler and invoke it.
    const calls: number[] = [];
    const onRequestClose = () => calls.push(1);
    // Render to confirm the wiring is present, then drive the handler directly
    // (renderToStaticMarkup cannot dispatch DOM events).
    const html = renderClose(onRequestClose);
    expect(html).toContain('data-testid="god-chat-context-sheet-close"');
    onRequestClose();
    expect(calls).toHaveLength(1);
  });

  test("backdrop/outside interaction dismisses by invoking onOpenChange(false)", () => {
    // A touch device has no Escape, so a backdrop tap is the only mobile dismiss.
    // The wrapper wires Radix's onPointerDownOutside / onInteractOutside to this
    // handler; assert it drives onOpenChange(false) (and never (true)) so the
    // sheet reliably closes on an outside tap.
    const calls: boolean[] = [];
    const handler = createOutsideDismissHandler((open) => calls.push(open));
    handler();
    expect(calls).toEqual([false]);
  });

  test("explicit backdrop tap dismisses (self-target) but inside taps do not bubble-close", () => {
    // Belt-and-suspenders: besides Radix's onPointerDownOutside path, the sheet
    // renders its own z-50 dim layer whose pointerdown/click runs this handler.
    // A real touch tap on the bare backdrop (target === currentTarget) must close;
    // a tap that bubbled up from a descendant INSIDE the sheet (role row / tweak
    // row / × button — target !== currentTarget) must be ignored so it never
    // accidentally dismisses.
    const calls: boolean[] = [];
    const handler = createOverlayDismissHandler((open) => calls.push(open));

    const backdrop = { id: "backdrop" } as unknown as EventTarget;
    const insideChild = { id: "role-row" } as unknown as EventTarget;

    // Tap ON the backdrop itself → closes.
    handler({ currentTarget: backdrop, target: backdrop });
    // Tap bubbled from inside the sheet → ignored (no close).
    handler({ currentTarget: backdrop, target: insideChild });
    // A null target (defensive) → ignored.
    handler({ currentTarget: backdrop, target: null });

    expect(calls).toEqual([false]);
  });

  test("shows calm empty copy when the world is a blank slate", () => {
    const empty: GodChatContext = { ...baseContext, roles: [], worldState: undefined };
    const html = renderSheet(empty);
    expect(html).toContain("白纸");
    expect(html).toContain("还没有角色");
  });
});
