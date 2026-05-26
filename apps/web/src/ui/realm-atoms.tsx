import type { ReactNode } from "react";
import { cn } from "./cn.ts";

export function Avatar({ label, tone }: { label: string; tone: "owner" | "role" }) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md font-semibold text-xs",
        tone === "owner" ? "bg-realm-primary text-white" : "bg-white text-zinc-600",
      )}
      aria-hidden="true"
    >
      {initials || "R"}
    </div>
  );
}

export function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 font-semibold text-sm">
      {icon}
      <span>{title}</span>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#fafafa] px-3 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-1 truncate font-medium text-sm">{value}</div>
    </div>
  );
}

export function SystemBanner({ body, title }: { body: string; title: string }) {
  return (
    <section className="mx-auto max-w-[760px] rounded-md bg-white px-4 py-3 text-center shadow-[0_1px_1px_rgba(0,0,0,0.03)]">
      <div className="font-medium text-sm text-zinc-800">{title}</div>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </section>
  );
}
