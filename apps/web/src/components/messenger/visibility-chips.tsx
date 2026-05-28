import type { RoleSummary } from "@realm/api-contract";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";

type VisibilityChipsProps = {
  className?: string;
  roleIds: string[];
  roles: RoleSummary[];
  maxVisible?: number;
};

export function VisibilityChips({
  className,
  maxVisible = 3,
  roleIds,
  roles,
}: VisibilityChipsProps) {
  const { t } = useI18n();
  const labels = roleIds.map((id) => roleLabel(id, roles));
  const visibleLabels = labels.slice(0, maxVisible);
  const overflow = labels.length - visibleLabels.length;

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1 text-[11px] text-[#6e6e73]", className)}
      data-testid="visibility-chips"
    >
      <span className="shrink-0">{t("workspace.visibleTo")}</span>
      <span className="inline-flex min-w-0 items-center gap-1">
        {visibleLabels.map((label) => (
          <span
            className="max-w-24 truncate rounded-full bg-[#f0f0f2] px-1.5 py-0.5"
            key={label}
            title={label}
          >
            {label}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="rounded-full bg-[#f0f0f2] px-1.5 py-0.5">+{overflow}</span>
        ) : null}
      </span>
    </span>
  );
}

function roleLabel(id: string, roles: RoleSummary[]): string {
  if (id === "owner") {
    return "Boss";
  }
  if (id === "god") {
    return "God";
  }
  return roles.find((role) => role.id === id)?.displayName ?? id;
}
