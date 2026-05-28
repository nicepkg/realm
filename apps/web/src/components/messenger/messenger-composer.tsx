import type { RoleSummary } from "@realm/api-contract";
import {
  AudioLines,
  Command,
  Database,
  Mic,
  Plus,
  Settings,
  ShieldCheck,
  Smile,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";
import { IdentityAvatar } from "./messenger-primitives.tsx";
import { RoleTurnActionGroup } from "./role-turn-action.tsx";

export function MessengerComposer({
  app,
  onOpenGod,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenWorldInspector,
}: {
  app: RealmAppController;
  onOpenGod: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenWorldInspector: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [actionTrayOpen, setActionTrayOpen] = useState(false);
  const [pendingIdentity, setPendingIdentity] = useState<string | undefined>();
  const pendingIdentityLabel = pendingIdentity
    ? displayNameForIdentity(pendingIdentity, app.state.roles)
    : undefined;
  const canSend = Boolean(app.selectedRoom && app.draft.trim() && !pendingIdentity);
  const isImpersonating = app.identity !== "owner";
  const activeIdentityLabel = isImpersonating
    ? displayNameForIdentity(app.identity, app.state.roles)
    : t("common.boss");

  useEffect(() => {
    resizeComposer(inputRef.current, app.draft.length);
  }, [app.draft.length]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    await app.sendMessage(event);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <footer
      className="shrink-0 border-[#d9d9dc] border-t bg-[#f7f7f7]"
      data-testid="composer"
      data-wechat-composer="voice-input-emoji-plus-send"
    >
      <form className="w-full" onSubmit={submit}>
        <div className="flex items-center gap-2 px-5 pt-2.5">
          <button
            aria-label={t("workspace.sendAs")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition",
              isImpersonating
                ? "bg-[#fff4e5] text-[#7a4a00] hover:bg-[#ffe8bf]"
                : "bg-[#ececee] text-[var(--realm-fg-muted)] hover:bg-[#e2e2e5]",
            )}
            data-testid="composer-identity-chip"
            data-identity-impersonating={isImpersonating ? "true" : "false"}
            onClick={() => setActionTrayOpen((open) => !open)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                isImpersonating ? "bg-[var(--realm-impersonate,#ff9500)]" : "bg-[#a0a0a5]",
              )}
            />
            <span className="max-w-[160px] truncate font-medium">
              {isImpersonating
                ? `${t("workspace.speakingAs")} ${activeIdentityLabel}`
                : t("workspace.sendAsBoss")}
            </span>
          </button>
          {isImpersonating ? (
            <button
              className="inline-flex items-center rounded-full px-2 py-1 text-[#7a4a00] text-[12px] underline-offset-2 transition hover:underline"
              data-testid="composer-exit-takeover"
              onClick={() => app.setIdentity("owner")}
              type="button"
            >
              {t("workspace.exitTakeover")}
            </button>
          ) : null}
        </div>
        {pendingIdentity && pendingIdentityLabel ? (
          <div
            className="mx-4 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#fff4e5] px-3 py-2 text-[#7a4a00] text-[12px]"
            data-testid="identity-confirmation"
          >
            <span>
              {t("workspace.takeoverConfirm")} {pendingIdentityLabel}.{" "}
              {t("workspace.identityAudit")}
            </span>
            <span className="flex gap-2">
              <Button
                className="h-7 bg-white px-2 text-[#7a4a00] hover:bg-[#ffe8bf]"
                data-testid="confirm-identity-takeover"
                onClick={() => {
                  app.setIdentity(pendingIdentity);
                  setPendingIdentity(undefined);
                  setActionTrayOpen(false);
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("common.confirm")}
              </Button>
              <Button
                className="h-7 px-2"
                onClick={() => setPendingIdentity(undefined)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("common.cancel")}
              </Button>
            </span>
          </div>
        ) : null}
        <div className="flex min-h-[88px] w-full items-center gap-2.5 px-5 py-[14px]">
          <Button
            aria-label={t("workspace.voiceInput")}
            className="size-[42px] rounded-full border-2 border-[#1f1f21] bg-transparent text-[#1f1f21] shadow-none hover:bg-white"
            data-testid="composer-voice"
            onClick={() => {
              inputRef.current?.focus();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <AudioLines className="size-[21px]" />
          </Button>
          <div className="relative min-w-0 flex-1">
            <textarea
              aria-label={t("workspace.messageInput")}
              className="max-h-32 min-h-[44px] w-full resize-none rounded-[4px] border-0 bg-white px-4 py-[11px] pr-11 text-[16px] leading-[22px] shadow-none outline-none placeholder:text-[#b0b0b3] focus-visible:!outline-none focus-visible:!ring-0"
              data-testid="message-input"
              disabled={!app.selectedRoom}
              name="message"
              onChange={(event) => app.setDraft(event.currentTarget.value)}
              onInput={(event) => resizeComposer(event.currentTarget)}
              onKeyDown={handleInputKeyDown}
              placeholder={t("workspace.messageInput")}
              ref={inputRef}
              rows={1}
              value={app.draft}
            />
            <Mic
              aria-hidden="true"
              className="absolute right-3 bottom-[12px] size-5 text-[#8a8a8f]"
            />
          </div>
          <Button
            aria-label={t("workspace.emoji")}
            className="size-[42px] rounded-full border-2 border-[#1f1f21] text-[#1f1f21] shadow-none hover:bg-white"
            data-testid="composer-emoji"
            onClick={() => app.setDraft(`${app.draft}${app.draft ? " " : ""}🙂`)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Smile className="size-[21px]" />
          </Button>
          <Button
            aria-label={t("workspace.moreActions")}
            className={cn(
              "size-[42px] rounded-full border-2 border-[#1f1f21] text-[#1f1f21] shadow-none hover:bg-white",
              canSend && "hidden",
            )}
            data-testid="composer-more"
            onClick={() => setActionTrayOpen((open) => !open)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus className="size-[22px]" />
          </Button>
          <Button
            className={cn(
              "h-9 rounded-[4px] px-4 text-[14px] shadow-none",
              canSend
                ? "bg-[var(--realm-green)] text-white hover:bg-[var(--realm-green-strong)]"
                : "hidden",
            )}
            data-testid="composer-send"
            disabled={!canSend}
            type="submit"
          >
            {t("common.send")}
          </Button>
        </div>
        {actionTrayOpen ? (
          <ComposerActionTray
            app={app}
            onOpenCommandPalette={() => {
              setActionTrayOpen(false);
              onOpenCommandPalette();
            }}
            onOpenGod={() => {
              setActionTrayOpen(false);
              onOpenGod();
            }}
            onOpenWorldInspector={() => {
              setActionTrayOpen(false);
              onOpenWorldInspector();
            }}
            onOpenSettings={() => {
              setActionTrayOpen(false);
              onOpenSettings();
            }}
            setActionTrayOpen={setActionTrayOpen}
            setPendingIdentity={setPendingIdentity}
          />
        ) : null}
      </form>
    </footer>
  );
}

function ComposerActionTray({
  app,
  onOpenCommandPalette,
  onOpenGod,
  onOpenSettings,
  onOpenWorldInspector,
  setActionTrayOpen,
  setPendingIdentity,
}: {
  app: RealmAppController;
  onOpenCommandPalette: () => void;
  onOpenGod: () => void;
  onOpenSettings: () => void;
  onOpenWorldInspector: () => void;
  setActionTrayOpen: (open: boolean) => void;
  setPendingIdentity: (identity: string | undefined) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="grid max-h-[228px] grid-cols-4 gap-x-3 gap-y-4 overflow-auto border-[#d9d9dc] border-t bg-[#f2f2f4] px-5 py-4 sm:grid-cols-6 lg:grid-cols-8"
      data-testid="composer-action-tray"
    >
      <IdentityButton
        active={app.identity === "owner"}
        identity="owner"
        label={t("common.boss")}
        roles={app.state.roles}
        testId="identity-owner"
        onClick={() => {
          setPendingIdentity(undefined);
          app.setIdentity("owner");
          setActionTrayOpen(false);
        }}
      />
      {app.state.roles.map((role) => (
        <IdentityButton
          active={app.identity === role.id}
          identity={role.id}
          key={role.id}
          label={role.displayName}
          roles={app.state.roles}
          testId={`identity-role-${role.id}`}
          onClick={() => {
            if (role.id !== app.identity) {
              setPendingIdentity(role.id);
              setActionTrayOpen(false);
            }
          }}
        />
      ))}
      <RoleTurnActionGroup app={app} />
      <ComposerActionButton
        icon={<Command className="size-6" />}
        label={t("common.command")}
        onClick={onOpenCommandPalette}
        testId="composer-command"
      />
      <ComposerActionButton
        icon={<ShieldCheck className="size-6" />}
        label={t("workspace.godController")}
        onClick={onOpenGod}
        testId="operator-god"
      />
      <ComposerActionButton
        icon={<Database className="size-6" />}
        label={t("inspector.world")}
        onClick={onOpenWorldInspector}
        testId="operator-world-inspector"
      />
      <ComposerActionButton
        icon={<Settings className="size-6" />}
        label={t("common.settings")}
        onClick={onOpenSettings}
        testId="operator-settings"
      />
    </div>
  );
}

function IdentityButton({
  active,
  identity,
  label,
  onClick,
  roles,
  testId,
}: {
  active: boolean;
  identity: string;
  label: string;
  onClick: () => void;
  roles: RoleSummary[];
  testId: string;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1.5 text-[#555] text-[12px] transition",
        active && "text-[#087a43]",
      )}
      data-testid={testId}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span
        className={cn(
          "flex size-[54px] items-center justify-center rounded-[9px] bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
          active && "ring-2 ring-[#07c160] ring-offset-2 ring-offset-[#f2f2f4]",
        )}
      >
        <IdentityAvatar identity={identity} label={label} roles={roles} size="md" />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function ComposerActionButton({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="flex min-w-0 flex-col items-center gap-1.5 text-[#555] text-[12px] transition hover:text-[#111]"
      data-testid={testId}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="flex size-[54px] items-center justify-center rounded-[9px] bg-white text-[#333] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
        {icon}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function resizeComposer(textarea: HTMLTextAreaElement | null, contentLength?: number) {
  if (!textarea) {
    return;
  }
  textarea.style.height = contentLength === 0 ? "44px" : "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
}
