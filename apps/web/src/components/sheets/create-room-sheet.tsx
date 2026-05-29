import { MessageCirclePlus } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { IdentityAvatar } from "@/components/messenger/messenger-primitives.tsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/index.tsx";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { ConfigActionSheetKind, RoomType } from "./config-action-types.ts";

/**
 * WeChat-style room creation. The current viewer account is always a locked
 * member (you cannot create a group you are not in — error prevention). For a
 * private chat exactly one other member is picked; for a group, any number.
 * Membership is fixed at creation (no add-member API yet — see spec §8.2).
 */
export function CreateRoomSheet({
  app,
  initialType = "group",
  onOpenChange,
  open,
}: {
  app: RealmAppController;
  initialType?: RoomType;
  open: boolean;
  onOpenChange: (open: ConfigActionSheetKind | undefined) => void;
}) {
  const { t } = useI18n();
  const isDm = initialType === "dm";
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Reset transient state each time the sheet opens with a fresh preset.
  useEffect(() => {
    if (open) {
      setName("");
      setPicked([]);
      setError(undefined);
    }
  }, [open]);

  const viewer = app.viewerIdentity;
  const viewerLabel =
    viewer === "owner"
      ? t("workspace.bossPersona")
      : displayNameForIdentity(viewer, app.state.roles);
  // Selectable members exclude the locked viewer account.
  const selectable = app.state.roles.filter((role) => role.id !== viewer);
  const memberIds = useMemo(() => [viewer, ...picked], [viewer, picked]);
  const canCreate = Boolean(
    app.selectedWorld && (isDm ? picked.length === 1 : name.trim() && picked.length > 0),
  );

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : isDm
          ? [id]
          : [...current, id],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(app.selectedWorld && canCreate)) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const groupName =
      name.trim() ||
      picked
        .map((id) => displayNameForIdentity(id, app.state.roles))
        .filter(Boolean)
        .join("、");
    try {
      const response = await app.client.createRoom(app.selectedWorld.id, {
        idempotencyKey: `web-create-room-${Date.now()}`,
        memberIds,
        name: groupName,
        type: initialType,
      });
      await app.reload();
      await app.selectRoom(response.room.id);
      onOpenChange(undefined);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next ? "create-room" : undefined)}>
      <SheetContent className="max-h-screen w-[460px] max-w-[94vw] overflow-y-auto border-[var(--realm-line)] bg-white">
        <SheetHeader>
          <SheetTitle>{isDm ? t("workspace.newDm") : t("workspace.newGroup")}</SheetTitle>
          <SheetDescription>{t("sheet.createRoom.description")}</SheetDescription>
        </SheetHeader>
        <form className="space-y-4 px-4" onSubmit={submit}>
          {isDm ? null : (
            <label className="block space-y-1" htmlFor="create-room-name">
              <span className="text-[12px] text-[var(--realm-fg-muted)]">
                {t("sheet.createRoom.name")}
              </span>
              <Input
                autoComplete="off"
                data-testid="create-room-name"
                id="create-room-name"
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder={t("workspace.groupNamePlaceholder")}
                value={name}
              />
            </label>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--realm-fg-muted)]">
                {t("workspace.memberPicker")}
              </span>
              <span className="text-[12px] text-[var(--realm-fg-faint)] tabular-nums">
                {t("workspace.selectedCount")(memberIds.length)}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-[8px] bg-[var(--realm-surface-muted)] px-2 py-1.5">
              <IdentityAvatar
                identity={viewer}
                label={viewerLabel}
                roles={app.state.roles}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-[14px]">{viewerLabel}</span>
              <span className="text-[12px] text-[var(--realm-fg-faint)]">
                {t("workspace.lockedMember")}
              </span>
            </div>
            <div className="space-y-0.5" data-testid="create-room-members">
              {selectable.map((role) => {
                const checked = picked.includes(role.id);
                // WeChat-style whole-row toggle implemented as a
                // role="checkbox" <div>, NOT a <button>. The Radix Checkbox
                // renders its own interactive <button role=checkbox>; nesting it
                // inside a second <button> is invalid DOM and triggers a React
                // update loop ("Maximum update depth exceeded"). Keeping the row
                // as a div makes the checkbox indicator purely visual
                // (pointer-events-none) while the row owns click + keyboard.
                return (
                  // biome-ignore lint/a11y/useSemanticElements: a native <button> would nest the Radix checkbox button (invalid DOM, infinite render loop); role="checkbox" on a div is the correct widget here.
                  <div
                    aria-checked={checked}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition outline-none hover:bg-[var(--realm-hover)] focus-visible:bg-[var(--realm-hover)]"
                    data-testid={`create-room-member-${role.id}`}
                    key={role.id}
                    onClick={() => toggle(role.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(role.id);
                      }
                    }}
                    role="checkbox"
                    tabIndex={0}
                  >
                    <Checkbox
                      aria-hidden="true"
                      checked={checked}
                      className="pointer-events-none"
                      tabIndex={-1}
                    />
                    <IdentityAvatar
                      identity={role.id}
                      label={role.displayName}
                      roles={app.state.roles}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{role.displayName}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {error ? (
            <div
              className="rounded-md bg-[var(--realm-impersonate-soft)] p-2 text-[#7a4a00] text-[12px]"
              data-testid="create-room-error"
            >
              <div className="font-medium">{t("sheet.createRoom.failed")}</div>
              <div>{error}</div>
            </div>
          ) : null}
          <Button data-testid="create-room-submit" disabled={!canCreate || busy} type="submit">
            <MessageCirclePlus className="size-4" />
            {busy
              ? t("sheet.createRoom.creating")
              : isDm
                ? t("workspace.newDm")
                : t("sheet.createRoom.create")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
