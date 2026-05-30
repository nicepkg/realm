import { lazy, Suspense, useRef } from "react";
import type { RealmAppController } from "@/app/types.ts";

/**
 * The workspace sheets are the demoted "精细调整 / 高级" precise-tweak surfaces,
 * reached only via the chat shell's 高级 / 命令面板 / 设置 entry points — never the
 * primary chat timeline/composer. Per the NL-first vision the home chat window must
 * ship in the initial synchronous chunk and render instantly, so these rare-exception
 * surfaces are split into their own lazily-loaded chunks (React.lazy + dynamic import).
 *
 * Each sheet's chunk is fetched the first time its overlay opens and then kept
 * mounted (driven by the `open` prop, exactly as before), so Radix's own enter/exit
 * animation is preserved — the only change vs. the old static version is that the JS
 * for a never-opened sheet never enters the initial bundle. Until the operator first
 * reaches for a control, the chat home pays nothing for it.
 */
const SettingsSheet = lazy(() =>
  import("./settings-sheet.tsx").then((m) => ({ default: m.SettingsSheet })),
);
const GodSheet = lazy(() => import("./god-sheet.tsx").then((m) => ({ default: m.GodSheet })));
const WorldInspectorSheet = lazy(() =>
  import("./world-inspector-sheet.tsx").then((m) => ({ default: m.WorldInspectorSheet })),
);
const RoleInspectorSheet = lazy(() =>
  import("./role-inspector-sheet.tsx").then((m) => ({ default: m.RoleInspectorSheet })),
);

export type WorkspaceSheetKind = "settings" | "god" | "role-inspector" | "world-inspector";

type WorkspaceSheetsProps = {
  app: RealmAppController;
  open: WorkspaceSheetKind | undefined;
  roleId?: string;
  onOpenChange: (open: WorkspaceSheetKind | undefined) => void;
  /**
   * Hand off to the shell-owned run-turn preview. The inspector stages the role
   * and closes itself, then calls this so the preview->confirm->running-bubble
   * cycle is driven by the single shared dialog (never a sheet-local copy).
   */
  onRequestRunTurn?: () => void;
};

/**
 * Apple-flat lazy fallback: a quiet right-edge skeleton wash matching the existing
 * `realm-skeleton` shimmer (no spinner-flash). It is only ever seen for the brief
 * moment between a sheet opening for the FIRST time and its chunk arriving; once the
 * chunk is cached, re-opening shows the real sheet instantly.
 */
function SheetChunkFallback() {
  return (
    <div
      aria-hidden
      className="realm-skeleton fixed inset-y-0 right-0 z-50 w-full max-w-md rounded-l-2xl sm:max-w-lg"
      data-testid="workspace-sheet-fallback"
    />
  );
}

export function WorkspaceSheets({
  app,
  onOpenChange,
  onRequestRunTurn,
  open,
  roleId,
}: WorkspaceSheetsProps) {
  // Record every kind that has ever been opened. Mutating the ref during render is
  // safe here (the value is read in the same render's JSX below) and lets a sheet
  // stay mounted once opened so Radix animates it CLOSED on the `open` prop, while a
  // never-opened sheet stays unmounted and its lazy chunk is never even requested.
  const openedRef = useRef<Set<WorkspaceSheetKind>>(new Set());
  if (open) {
    openedRef.current.add(open);
  }
  const opened = openedRef.current;

  return (
    <Suspense fallback={<SheetChunkFallback />}>
      {opened.has("settings") ? (
        <SettingsSheet app={app} open={open === "settings"} onOpenChange={onOpenChange} />
      ) : null}
      {/*
       * The God controller receives the full app controller, so it reads
       * `app.state.roles` — already narrowed by loadRealm to the selected world —
       * to detect a 0-role world and show its empty-state. No extra prop needed:
       * world-scoped roles flow through the controller, never via a copied list.
       */}
      {opened.has("god") ? (
        <GodSheet app={app} open={open === "god"} onOpenChange={onOpenChange} />
      ) : null}
      {opened.has("world-inspector") ? (
        <WorldInspectorSheet
          app={app}
          open={open === "world-inspector"}
          onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "world-inspector" : undefined)}
        />
      ) : null}
      {opened.has("role-inspector") ? (
        <RoleInspectorSheet
          app={app}
          roleId={roleId}
          open={open === "role-inspector"}
          onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "role-inspector" : undefined)}
          onRequestRunTurn={onRequestRunTurn}
          // "Request adjudication" seeds the God target from this role, then swaps
          // the open sheet from the inspector to the pre-targeted God controller.
          onOpenGod={(seededRoleId) => {
            if (seededRoleId) {
              app.setGodActionRoleId(seededRoleId);
            }
            onOpenChange("god");
          }}
        />
      ) : null}
    </Suspense>
  );
}
