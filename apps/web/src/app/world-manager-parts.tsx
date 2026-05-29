import {
  Check,
  CircleDot,
  Copy,
  DoorOpen,
  FolderGit2,
  Settings2,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { LocaleToggle } from "@/components/layout/locale-toggle.tsx";
import { CreateRoleSheet } from "@/components/sheets/create-role-sheet.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/index.tsx";

/** Operator context resolved once on mount: project path, provider, runtime. */
export type OperatorInfo = {
  rootPath?: string;
  provider?: string;
  model?: string;
  isMockRuntime: boolean;
};

/**
 * World Manager top bar: brand + project crumb, status / trust / world-count
 * chips, and a second strip carrying the real operator context (project path,
 * provider · model, mock-runtime badge). The path is a copy-to-clipboard
 * affordance with a transient check confirmation (Don Norman: feedback).
 */
export function WorldManagerHeader({
  projectName,
  isError,
  health,
  trustLabel,
  worldCountLabel,
  operator,
  copied,
  onCopyRootPath,
  onOpenSettings,
}: {
  projectName: string;
  isError: boolean;
  health: string;
  trustLabel: string;
  worldCountLabel: string;
  operator: OperatorInfo;
  copied: boolean;
  onCopyRootPath: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="shrink-0 border-[var(--realm-line)] border-b bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <RealmMark className="size-5 shrink-0 text-[var(--realm-green-text)]" />
          <span className="font-semibold text-[15px] text-[var(--realm-fg)]">
            {t("manager.brandName")}
          </span>
          <span className="text-[var(--realm-fg-faint)]">/</span>
          <span className="truncate font-medium text-[13px] text-[var(--realm-fg-muted)]">
            {projectName}
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-[12px]">
          <span className="hidden items-center gap-1 text-[var(--realm-fg-muted)] sm:inline-flex">
            <CircleDot
              className={
                isError ? "size-3 text-[var(--realm-warning)]" : "size-3 text-[var(--realm-green)]"
              }
            />
            {health}
          </span>
          <span className="hidden items-center gap-1 text-[var(--realm-fg-muted)] md:inline-flex">
            {t("manager.trustStatus")}: <span className="text-[var(--realm-fg)]">{trustLabel}</span>
          </span>
          <Badge className="border-transparent bg-[var(--realm-hover)] text-[var(--realm-fg-muted)]">
            {worldCountLabel}
          </Badge>
          <LocaleToggle />
          <Button
            aria-label={t("common.settings")}
            className="size-8"
            onClick={onOpenSettings}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
      </div>
      {/* Second strip line: real operator context — path / provider / runtime. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 text-[11px] text-[var(--realm-fg-muted)]">
        {operator.rootPath ? (
          <button
            className="realm-press flex min-w-0 items-center gap-1 rounded px-1 py-0.5 font-mono hover:bg-[var(--realm-hover)]"
            data-testid="manager-root-path"
            onClick={onCopyRootPath}
            title={operator.rootPath}
            type="button"
          >
            <FolderGit2 className="size-3 shrink-0" />
            <span className="max-w-[42vw] truncate sm:max-w-[280px]">
              {t("manager.rootPathLabel")}: {operator.rootPath}
            </span>
            {copied ? (
              <Check className="size-3 shrink-0 text-[var(--realm-green-text)]" />
            ) : (
              <Copy className="size-3 shrink-0 opacity-50" />
            )}
          </button>
        ) : null}
        {operator.provider ? (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true">·</span>
            {t("manager.providerLabel")}:{" "}
            <span className="text-[var(--realm-fg)]">
              {operator.provider}
              {operator.model ? ` · ${operator.model}` : ""}
            </span>
          </span>
        ) : null}
        {operator.isMockRuntime ? (
          <Badge
            className="border-transparent bg-[var(--realm-impersonate-soft)] text-[#9a5b00]"
            data-testid="manager-mock-runtime"
            title={t("manager.runtimeFakeHint")}
          >
            {t("manager.runtimeFake")}
          </Badge>
        ) : null}
      </div>
    </header>
  );
}

/** The Realm brand mark — two stacked rounded panes (layered worlds), one ink color. */
export function RealmMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <rect height="9" rx="2.5" width="14" x="3" y="3" fill="currentColor" opacity="0.35" />
      <rect height="9" rx="2.5" width="14" x="7" y="12" fill="currentColor" />
    </svg>
  );
}

type QuickStartStep = {
  icon: ReactNode;
  title: string;
  hint: string;
  testId: string;
  onClick: () => void;
  /** When set the step is non-actionable; the hint explains why (DISC-3). */
  disabled?: boolean;
};

/** A single quick-start step. Disabled steps stay inert but explain themselves
 * via a tooltip + dimmed treatment instead of routing to an unrelated action. */
function QuickStartItem({ step, index }: { step: QuickStartStep; index: number }) {
  const body = (
    <button
      className="realm-press flex h-full w-full items-start gap-3 rounded-lg border border-[var(--realm-line)] p-3 text-left transition hover:border-transparent hover:bg-[var(--realm-hover)] disabled:pointer-events-none disabled:opacity-50 disabled:hover:border-[var(--realm-line)] disabled:hover:bg-transparent"
      data-testid={step.testId}
      disabled={step.disabled}
      onClick={step.disabled ? undefined : step.onClick}
      type="button"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--realm-green-soft)] text-[var(--realm-green-text)]">
        {step.icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium text-[14px] text-[var(--realm-fg)]">
          <span className="text-[var(--realm-fg-faint)] text-xs">{index + 1}</span>
          {step.title}
        </span>
        <span className="mt-0.5 block text-[12px] text-[var(--realm-fg-muted)] leading-4">
          {step.hint}
        </span>
      </span>
    </button>
  );
  if (!step.disabled) {
    return body;
  }
  // Wrap the disabled control in a span so the tooltip still surfaces on hover.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-full w-full">{body}</span>
      </TooltipTrigger>
      <TooltipContent>{step.hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Quick-start gives the World Manager's lower region purpose so a short world
 * list never leaves a dead white void (Boss: "远远不够"). Each step routes to a
 * real action; the three-step shape reads at 0, 1, and 20 worlds alike. With
 * zero worlds the "enter room" step is genuinely impossible, so it renders
 * disabled-with-hint rather than aliasing to create-world (DISC-3).
 */
export function QuickStart({
  app,
  onCreateWorld,
  onAddRole,
  onEnterRoom,
  worldCount,
}: {
  /**
   * When provided, the "Add a role" step opens a structured Role Builder mounted
   * locally here (so this part owns its open state without a page prop). Absent
   * `app`, it falls back to `onAddRole` (e.g. routing to the assistant) (R6-2).
   */
  app?: RealmAppController;
  onCreateWorld: () => void;
  onAddRole: () => void;
  onEnterRoom: () => void;
  worldCount: number;
}) {
  const { t } = useI18n();
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const hasWorlds = worldCount > 0;
  const openAddRole = app ? () => setCreateRoleOpen(true) : onAddRole;
  const steps: QuickStartStep[] = [
    {
      icon: <Sparkles className="size-4" />,
      title: t("manager.quickStartCreateWorld"),
      hint: t("manager.quickStartCreateWorldHint"),
      testId: "quick-start-create-world",
      onClick: onCreateWorld,
    },
    {
      icon: <UserPlus className="size-4" />,
      title: t("manager.quickStartAddRole"),
      hint: t("manager.quickStartAddRoleHint"),
      testId: "quick-start-add-role",
      onClick: openAddRole,
    },
    {
      icon: <DoorOpen className="size-4" />,
      title: t("manager.quickStartEnterRoom"),
      // Before any world exists there is nothing to enter; explain the
      // prerequisite instead of silently routing back to create-world.
      hint: hasWorlds ? t("manager.quickStartEnterRoomHint") : t("manager.emptyBody"),
      testId: "quick-start-enter-room",
      onClick: onEnterRoom,
      disabled: !hasWorlds,
    },
  ];
  return (
    <section
      className="realm-rise rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      data-testid="quick-start"
      style={{ animationDelay: "60ms" }}
    >
      <h2 className="mb-3 font-semibold text-[15px] text-[var(--realm-fg)]">
        {t("manager.quickStartTitle")}
      </h2>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <QuickStartItem index={index} step={step} />
          </li>
        ))}
      </ol>
      {app ? (
        <CreateRoleSheet
          app={app}
          onOpenChange={setCreateRoleOpen}
          onPatchApplied={() => undefined}
          open={createRoleOpen}
        />
      ) : null}
    </section>
  );
}

export function WorldManagerSkeleton() {
  return (
    <div className="space-y-0">
      {["one", "two", "three"].map((item) => (
        <div
          className="grid grid-cols-[44px_minmax(0,1fr)_80px] items-center gap-3 px-4 py-4"
          key={item}
        >
          <Skeleton className="size-11 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
