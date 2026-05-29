import { UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";

/**
 * Persistent amber banner shown while the viewer is logged into a role account
 * (Boss impersonating a role). Shows displayed author + real operator + room,
 * and a one-click exit back to Boss. Amber, never green (design.md §8.1).
 */
export function ImpersonationBanner({
  displayedAuthor,
  roomName,
  worldName,
  onExitTakeover,
}: {
  displayedAuthor: string;
  roomName: string;
  worldName: string;
  onExitTakeover: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-[#ffd9a0] border-b bg-[var(--realm-impersonate-soft)] px-4 py-2 text-[#7a4a00] text-[12px]"
      data-testid="impersonation-banner"
      role="status"
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <UserCog className="size-4 shrink-0 text-[var(--realm-impersonate)]" />
        {t("workspace.speakingAs")} {displayedAuthor}
      </span>
      <span className="text-[#9a6a20]">
        {t("workspace.realOperator")}: {t("common.boss")}
      </span>
      <span className="text-[#9a6a20]">
        {worldName} · {roomName}
      </span>
      <Button
        className="ml-auto h-7 rounded-[6px] bg-white px-2.5 text-[#7a4a00] hover:bg-[#ffe8bf]"
        data-testid="exit-takeover"
        onClick={onExitTakeover}
        size="sm"
        type="button"
        variant="secondary"
      >
        {t("workspace.exitTakeover")}
      </Button>
    </div>
  );
}
