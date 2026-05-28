import { MessageCirclePlus } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/index.tsx";
import type { ConfigActionSheetKind, RoomType } from "./config-action-types.ts";

export function CreateRoomSheet({
  app,
  onOpenChange,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: ConfigActionSheetKind | undefined) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<RoomType>("group");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const memberIds = useMemo(() => (type === "dm" ? members.slice(0, 1) : members), [members, type]);
  const canCreate = Boolean(app.selectedWorld && name.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(app.selectedWorld && canCreate)) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await app.client.createRoom(app.selectedWorld.id, {
        idempotencyKey: `web-room-${Date.now()}`,
        memberIds,
        name: name.trim(),
        type,
      });
      await app.reload();
      await app.selectRoom(response.room.id);
      onOpenChange(undefined);
      setName("");
      setMembers([]);
      setType("group");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "create-room" : undefined)}
    >
      <SheetContent className="max-h-screen w-[460px] max-w-[94vw] overflow-y-auto border-[var(--realm-line)] bg-white">
        <SheetHeader>
          <SheetTitle>{t("sheet.createRoom.title")}</SheetTitle>
          <SheetDescription>{t("sheet.createRoom.description")}</SheetDescription>
        </SheetHeader>
        <form className="space-y-4 px-4" onSubmit={submit}>
          <label className="block space-y-1" htmlFor="create-room-name">
            <span className="text-[12px] text-[var(--realm-fg-muted)]">
              {t("sheet.createRoom.name")}
            </span>
            <Input
              id="create-room-name"
              autoComplete="off"
              data-testid="create-room-name"
              onChange={(event) => setName(event.currentTarget.value)}
              value={name}
            />
          </label>
          <Select value={type} onValueChange={(value) => setType(value as RoomType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="group">{t("sheet.createRoom.group")}</SelectItem>
              <SelectItem value="dm">{t("sheet.createRoom.dm")}</SelectItem>
              <SelectItem value="system">{t("sheet.createRoom.system")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="space-y-2">
            <div className="text-[12px] text-[var(--realm-fg-muted)]">
              {t("sheet.createRoom.members")}
            </div>
            <div className="flex flex-wrap gap-2">
              {app.state.roles.map((role) => (
                <button
                  className={
                    members.includes(role.id)
                      ? "rounded-full bg-[var(--realm-green)] px-3 py-1 text-white text-[12px]"
                      : "rounded-full bg-[#f0f0f2] px-3 py-1 text-[12px] text-[var(--realm-fg)]"
                  }
                  data-testid={`create-room-member-${role.id}`}
                  key={role.id}
                  onClick={() =>
                    setMembers((current) =>
                      current.includes(role.id)
                        ? current.filter((id) => id !== role.id)
                        : type === "dm"
                          ? [role.id]
                          : [...current, role.id],
                    )
                  }
                  type="button"
                >
                  {role.displayName}
                </button>
              ))}
            </div>
          </div>
          {error ? (
            <div
              className="rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
              data-testid="create-room-error"
            >
              <div className="font-medium">{t("sheet.createRoom.failed")}</div>
              <div>{error}</div>
            </div>
          ) : null}
          <Button data-testid="create-room-submit" disabled={!canCreate || busy} type="submit">
            <MessageCirclePlus className="size-4" />
            {busy ? t("sheet.createRoom.creating") : t("sheet.createRoom.create")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
