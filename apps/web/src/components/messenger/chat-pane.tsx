import { useI18n } from "@/i18n/index.tsx";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";
import { ChatHeader } from "./chat-header.tsx";
import { Composer } from "./composer.tsx";
import { ImpersonationBanner } from "./impersonation-banner.tsx";
import { MessageTimeline } from "./message-timeline.tsx";
import { ResumeIdentityChip } from "./resume-identity-chip.tsx";

/**
 * Center chat pane: header, impersonation banner (when viewing a role account),
 * message timeline, and composer. The composer is always present at the bottom.
 */
export function ChatPane({
  app,
  onBackToList,
  onOpenInspector,
  onOpenCommandPalette,
  onOpenGod,
  onOpenWorldInspector,
  onOpenSettings,
}: {
  app: RealmAppController;
  onBackToList: () => void;
  onOpenInspector: () => void;
  onOpenCommandPalette: () => void;
  onOpenGod: () => void;
  onOpenWorldInspector: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const isImpersonating = app.viewerIdentity !== "owner";

  return (
    <section
      className="relative flex min-w-0 flex-col bg-[var(--realm-bg)]"
      data-testid="chat-panel"
    >
      <ChatHeader
        app={app}
        onBackToList={onBackToList}
        onOpenCommandPalette={onOpenCommandPalette}
        onOpenGod={onOpenGod}
        onOpenInspector={onOpenInspector}
        onOpenSettings={onOpenSettings}
        onOpenWorldInspector={onOpenWorldInspector}
      />
      {isImpersonating ? (
        <ImpersonationBanner
          displayedAuthor={displayNameForIdentity(app.viewerIdentity, app.state.roles)}
          onExitTakeover={() => app.setViewerIdentity("owner")}
          roomName={app.selectedRoom?.name ?? t("common.room")}
          worldName={app.selectedWorld?.name ?? t("common.world")}
        />
      ) : null}
      <ResumeIdentityChip app={app} />
      <MessageTimeline app={app} />
      <Composer app={app} onOpenGod={onOpenGod} />
    </section>
  );
}
