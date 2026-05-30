import { Bot } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/index.tsx";
import { roomDisplayName } from "@/view-models/labels.ts";
import type { RealmAppController } from "../../app/types.ts";
import { RunRolePicker } from "./composer-run-role-picker.tsx";
import { useRuntimeInfo } from "./role-turn-runtime.ts";

/**
 * Shared run-turn confirmation. Exported so any Enter-driven surface (composer
 * row, empty CTA, command palette) can mount its own controlled instance and
 * route through the exact same preview gate — there is no direct-execute run
 * path anywhere (Don Norman: error prevention).
 */
export function RunTurnPreviewDialog({
  activeRole,
  activeRoom,
  activeWorld,
  app,
  onConfirm,
  onOpenChange,
  open,
}: {
  activeRole: { displayName: string; model?: string };
  activeRoom: Parameters<typeof roomDisplayName>[1];
  activeWorld: { name: string };
  app: RealmAppController;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useI18n();
  const runtime = useRuntimeInfo(app);
  // EP-R2-6: a run turn can spend provider tokens, so it must never be committed
  // by a reflex Enter. Focus Cancel on open (mirrors SimulationConfirmDialog) so
  // the default keyboard action is the safe one.
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        data-testid="run-turn-preview"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("workspace.runTurnPreviewTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.runTurnPreviewCancelHint")}</DialogDescription>
        </DialogHeader>
        <RunTurnPreviewBody
          activeRole={activeRole}
          activeRoom={activeRoom}
          activeWorld={activeWorld}
          app={app}
          runtime={runtime}
        />
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            ref={cancelRef}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            data-testid="run-turn-preview-confirm"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            type="button"
          >
            <Bot className="size-4" />
            {t("workspace.runTurn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The preview body: run-role chooser + the role / model / runtime / target rows.
 * Exported (and the `runtime` value injected) so it can be asserted without the
 * Radix portal that swallows DialogContent under server rendering.
 */
export function RunTurnPreviewBody({
  activeRole,
  activeRoom,
  activeWorld,
  app,
  runtime,
}: {
  activeRole: { displayName: string; model?: string };
  activeRoom: Parameters<typeof roomDisplayName>[1];
  activeWorld: { name: string };
  app: RealmAppController;
  runtime: { adapterKind: string } | undefined;
}) {
  const { t } = useI18n();
  // DISC-R2-5: name WHICH runtime will answer — the mock adapter is called out
  // explicitly so a simulated reply is never mistaken for a real provider one.
  const runtimeValue =
    runtime === undefined
      ? undefined
      : runtime.adapterKind === "fake"
        ? t("workspace.runTurnRuntimeMock")
        : runtime.adapterKind;
  return (
    <>
      {/* DISC-R2-5: a wrong auto-bound target is fixable AT the gate — the same
          run-role chooser is mounted here so the operator corrects WHO runs
          without cancelling and navigating away (Don Norman: recovery). It
          self-hides for a single-member room (nothing to choose). */}
      <div className="flex items-center justify-between gap-3 rounded-[8px] bg-[var(--realm-surface-muted)] px-3 py-2">
        <span className="text-[13px] text-[var(--realm-fg-muted)]">
          {t("workspace.runTurnPreviewRole")}
        </span>
        <RunRolePicker
          onPick={app.setRunRoleId}
          roles={app.state.roles}
          room={app.selectedRoom}
          runRoleId={app.runRoleId}
        />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]">
        <PreviewRow label={t("workspace.runTurnPreviewRole")} value={activeRole.displayName} />
        <PreviewRow
          label={t("workspace.runTurnPreviewModel")}
          value={activeRole.model ?? t("common.default")}
        />
        {runtimeValue ? (
          <PreviewRow
            label={t("workspace.runTurnPreviewRuntime")}
            testId="run-turn-preview-runtime"
            value={runtimeValue}
          />
        ) : null}
        <PreviewRow
          label={t("workspace.runTurnPreviewTarget")}
          value={`${activeWorld.name} · ${roomDisplayName(t, activeRoom)}`}
        />
      </dl>
    </>
  );
}

function PreviewRow({ label, testId, value }: { label: string; testId?: string; value: string }) {
  return (
    <>
      <dt className="text-[var(--realm-fg-muted)]">{label}</dt>
      <dd className="truncate font-medium text-[var(--realm-fg)]" data-testid={testId}>
        {value}
      </dd>
    </>
  );
}
