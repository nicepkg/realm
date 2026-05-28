import { Wifi } from "lucide-react";
import { useState } from "react";
import {
  ChatHeader,
  MessengerComposer,
  MessengerTimeline,
} from "@/components/messenger/messenger-chat.tsx";
import { MessengerSidebar, MobileRailSheet } from "@/components/messenger/messenger-sidebar.tsx";
import { useI18n } from "@/i18n/index.tsx";
import type { RealmAppController } from "../../app/types.ts";

type DesktopMessengerProps = {
  app: RealmAppController;
  onBackToWorlds: () => void;
  onCreateRoom: () => void;
  onOpenGod: () => void;
  onOpenWorldInspector: () => void;
  onOpenCommandPalette: () => void;
  onInspectRole: (roleId: string) => void;
  onOpenSettings: () => void;
};

export function DesktopMessenger({
  app,
  onBackToWorlds,
  onCreateRoom,
  onOpenGod,
  onOpenWorldInspector,
  onOpenCommandPalette,
  onInspectRole,
  onOpenSettings,
}: DesktopMessengerProps) {
  const { t } = useI18n();
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  return (
    <main className="h-screen max-h-screen overflow-hidden bg-[#ededee] text-[var(--realm-fg)]">
      <section className="flex h-full min-h-0 flex-col" data-testid="realm-shell">
        <WechatStatusBar app={app} />
        <section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(360px,33.333vw)_minmax(0,1fr)]">
          <MessengerSidebar
            app={app}
            onCreateRoom={onCreateRoom}
            onInspectRole={onInspectRole}
            onOpenGod={onOpenGod}
            onOpenSettings={onOpenSettings}
          />
          <section className="relative flex min-w-0 flex-col bg-[#ededee]" data-testid="chat-panel">
            <ChatHeader
              app={app}
              onBackToWorlds={onBackToWorlds}
              onOpenCommandPalette={onOpenCommandPalette}
              onOpenGod={onOpenGod}
              onOpenRail={() => setMobileRailOpen(true)}
              onOpenSettings={onOpenSettings}
              onOpenWorldInspector={onOpenWorldInspector}
            />
            <MessengerTimeline app={app} />
            <MessengerComposer
              app={app}
              onOpenCommandPalette={onOpenCommandPalette}
              onOpenGod={onOpenGod}
              onOpenWorldInspector={onOpenWorldInspector}
              onOpenSettings={onOpenSettings}
            />
          </section>
        </section>
      </section>
      <MobileRailSheet
        app={app}
        onCreateRoom={onCreateRoom}
        onInspectRole={onInspectRole}
        onOpenChange={setMobileRailOpen}
        onOpenGod={onOpenGod}
        onOpenSettings={onOpenSettings}
        open={mobileRailOpen}
      />
      <span className="sr-only">{t("workspace.localRuntime")}</span>
    </main>
  );
}

function WechatStatusBar({ app }: { app: RealmAppController }) {
  const now = new Date();
  const weekday = now.toLocaleDateString("zh-CN", { weekday: "short" });
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日${weekday}`;
  const time = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });

  return (
    <header
      className="grid h-10 shrink-0 grid-cols-[1fr_auto] border-[var(--realm-line)] border-b bg-[#f2f2f2] px-0 font-semibold text-[#111] text-[15px] md:grid-cols-[minmax(360px,33.333vw)_minmax(0,1fr)]"
      data-testid="wechat-status-bar"
    >
      <div className="flex min-w-0 items-center gap-3 px-5 md:px-6">
        <span>{time}</span>
        <span className="hidden truncate sm:inline">{dateLabel}</span>
        <span className="sr-only">{app.state.projectName}</span>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 md:px-6">
        <Wifi aria-hidden="true" className="size-[17px]" />
        <span className="tabular-nums">93%</span>
        <span
          aria-hidden="true"
          className="relative h-[15px] w-[27px] rounded-[4px] border-2 border-[#111] after:absolute after:top-[3px] after:right-[-5px] after:h-[5px] after:w-[3px] after:rounded-r-sm after:bg-[#111] before:absolute before:inset-[2px] before:rounded-[2px] before:bg-[#111]"
        />
      </div>
    </header>
  );
}
