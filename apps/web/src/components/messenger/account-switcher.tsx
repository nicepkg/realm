import { Check } from "lucide-react";
import { useState } from "react";
import { LocaleToggle } from "@/components/layout/locale-toggle.tsx";
import { IdentityAvatar } from "@/components/messenger/messenger-primitives.tsx";
import { TakeoverConfirmDialog } from "@/components/messenger/takeover-confirm-dialog.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { RealmAppController } from "../../app/types.ts";

/**
 * WeChat-like account switcher. Lists the Boss persona first, then every world
 * role as a switchable account. Choosing a role opens a takeover confirmation
 * (L2 dangerous action); choosing Boss returns to the operator view immediately
 * (returning to yourself is always safe). Rebuild spec §7.3.
 */
export function AccountSwitcher({
  app,
  anchor,
  open,
  onOpenChange,
}: {
  app: RealmAppController;
  /** Element the popover anchors to (the rail account avatar / bottom tab). */
  anchor: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <AccountSwitcherBody app={app} onOpenChange={onOpenChange} />
    </Popover>
  );
}

function AccountSwitcherBody({
  app,
  onOpenChange,
}: {
  app: RealmAppController;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [pendingRoleId, setPendingRoleId] = useState<string | undefined>();

  const choose = (id: string) => {
    if (id === app.viewerIdentity) {
      onOpenChange(false);
      return;
    }
    if (id === "owner") {
      app.setViewerIdentity("owner");
      onOpenChange(false);
      return;
    }
    setPendingRoleId(id);
  };

  return (
    <>
      <PopoverContent align="end" className="w-64 p-1" data-testid="account-switcher" side="right">
        <p className="px-2 pt-1.5 pb-1 font-medium text-[12px] text-[var(--realm-fg-muted)]">
          {t("workspace.accountSwitchTitle")}
        </p>
        <AccountOption
          active={app.viewerIdentity === "owner"}
          identity="owner"
          label={t("workspace.bossPersona")}
          onSelect={() => choose("owner")}
          roles={app.state.roles}
          testId="account-option-owner"
        />
        {app.state.roles.map((role) => (
          <AccountOption
            active={app.viewerIdentity === role.id}
            identity={role.id}
            key={role.id}
            label={role.displayName}
            onSelect={() => choose(role.id)}
            roles={app.state.roles}
            secondary={role.id}
            testId={`account-option-${role.id}`}
          />
        ))}
        <div className="mt-1 flex items-center justify-between border-[var(--realm-line)] border-t px-2 pt-2">
          <span className="text-[12px] text-[var(--realm-fg-muted)]">
            {t("sheet.settings.language")}
          </span>
          <LocaleToggle />
        </div>
      </PopoverContent>
      <TakeoverConfirmDialog
        app={app}
        onCancel={() => setPendingRoleId(undefined)}
        onConfirm={(id) => {
          app.setViewerIdentity(id);
          setPendingRoleId(undefined);
          onOpenChange(false);
        }}
        pendingRoleId={pendingRoleId}
      />
    </>
  );
}

function AccountOption({
  active,
  identity,
  label,
  onSelect,
  roles,
  secondary,
  testId,
}: {
  active: boolean;
  identity: string;
  label: string;
  onSelect: () => void;
  roles: RealmAppController["state"]["roles"];
  secondary?: string;
  testId: string;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition hover:bg-[var(--realm-hover)]",
        active && "bg-[var(--realm-selected)] hover:bg-[var(--realm-selected)]",
      )}
      data-testid={testId}
      onClick={onSelect}
      type="button"
    >
      <IdentityAvatar identity={identity} label={label} roles={roles} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-[14px] text-[var(--realm-fg)]">
          {label}
        </span>
        {secondary ? (
          <span className="block truncate text-[12px] text-[var(--realm-fg-muted)]">
            {secondary}
          </span>
        ) : null}
      </span>
      {active ? (
        <Check
          className="size-4 shrink-0 text-[var(--realm-green)]"
          data-testid={`${testId}-active`}
        />
      ) : null}
    </button>
  );
}
