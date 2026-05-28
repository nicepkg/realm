import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";

type ImpersonationBannerProps = {
  identity: string;
  roles: RoleSummary[];
  room?: Room;
  world?: WorldSummary;
  onExit: () => void;
};

export function ImpersonationBanner({
  identity,
  onExit,
  roles,
  room,
  world,
}: ImpersonationBannerProps) {
  const { t } = useI18n();

  if (identity === "owner") {
    return null;
  }

  const role = roles.find((candidate) => candidate.id === identity);
  const displayedAuthor = role?.displayName ?? identity;

  return (
    <section
      className="flex h-9 shrink-0 items-center justify-between gap-2 border-[#ff9500] border-b bg-[#fff4e5] px-4 text-[#7a4a00] text-xs"
      data-testid="impersonation-banner"
    >
      <div className="flex min-w-0 items-center gap-2">
        <ShieldAlert className="size-4 shrink-0 text-[#ff9500]" />
        <span className="min-w-0 truncate">
          {t("workspace.speaking")} <span className="font-semibold">{displayedAuthor}</span>;{" "}
          {t("workspace.identityAudit")} {world?.name ?? ""} / {room?.name ?? ""}.
        </span>
      </div>
      <Button
        className="h-7 shrink-0 bg-white px-2 text-[#7a4a00] hover:bg-[#ffe8bf]"
        size="sm"
        type="button"
        variant="secondary"
        onClick={onExit}
      >
        <LogOut className="size-3.5" />
        <span className="hidden sm:inline">{t("workspace.exitTakeover")}</span>
      </Button>
    </section>
  );
}
