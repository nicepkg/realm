import type { RoleSummary } from "@realm/api-contract";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { MentionCandidate } from "./composer-mentions.ts";
import { IdentityAvatar } from "./messenger-primitives.tsx";
import type { useProjectTrust } from "./use-project-trust.ts";

/**
 * Inline read-only hint shown beside the composer when the project is read-only.
 * It both EXPLAINS why Send/Run are disabled (Don Norman: feedback) and offers
 * the one-click recovery (raise trust to run-roles) right where the constraint
 * bites — not buried in the World Manager. Reuses the manager trust dictionary.
 */
export function ReadOnlyHint({ trust }: { trust: ReturnType<typeof useProjectTrust> }) {
  const { t } = useI18n();
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-[var(--realm-line)] border-b bg-[var(--realm-surface-muted)] px-3 py-2 text-[12px] text-[var(--realm-fg-muted)]"
      data-testid="composer-readonly-hint"
      role="status"
    >
      <span className="rounded-full bg-[var(--realm-hover)] px-2 py-0.5 font-medium text-[var(--realm-fg)]">
        {t("manager.trustReadOnly")}
      </span>
      <span className="min-w-0 flex-1 truncate">{t("manager.trustBannerBody")}</span>
      <Button
        className="h-7 shrink-0 rounded-[7px] bg-[var(--realm-green)] px-2.5 text-[12px] text-white hover:bg-[var(--realm-green-strong)]"
        data-testid="composer-raise-trust"
        disabled={trust.raising}
        onClick={() => void trust.raiseTrust()}
        size="sm"
        type="button"
      >
        {trust.raising ? t("manager.trustBannerPending") : t("manager.trustBannerAction")}
      </Button>
      {trust.raiseFailed ? (
        <span className="shrink-0 text-[var(--realm-warning)]" data-testid="composer-trust-error">
          {t("manager.trustBannerError")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Floating list of mention candidates anchored above the composer row. The
 * label always shows so the user knows what the popover is; an empty filter
 * shows the same label as a calm "no match" state (no generic "No data").
 * onMouseDown.preventDefault keeps textarea focus so onBlur does not race the
 * click that selects an option.
 */
export function MentionPopover({
  activeIndex,
  matches,
  onChoose,
  onHover,
  roles,
}: {
  activeIndex: number;
  matches: MentionCandidate[];
  onChoose: (candidate: MentionCandidate) => void;
  onHover: (index: number) => void;
  roles: RoleSummary[];
}) {
  const { t } = useI18n();
  return (
    <div
      aria-label={t("composer.mentionHint")}
      className="absolute bottom-[calc(100%+4px)] left-3 z-20 max-h-56 w-64 overflow-y-auto rounded-[10px] border border-[var(--realm-line)] bg-[var(--realm-surface)] py-1 shadow-[0_8px_28px_rgba(15,23,42,0.14)]"
      data-testid="composer-mention-popover"
      id="composer-mention-popover"
      role="listbox"
    >
      <div className="px-3 py-1 text-[11px] text-[var(--realm-fg-faint)]">
        {t("composer.mentionHint")}
      </div>
      {matches.map((candidate, index) => (
        <button
          aria-selected={index === activeIndex}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[14px]",
            index === activeIndex
              ? "bg-[var(--realm-surface-muted)]"
              : "hover:bg-[var(--realm-surface-muted)]",
          )}
          data-testid={`composer-mention-option-${candidate.id}`}
          key={candidate.id}
          onClick={() => onChoose(candidate)}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHover(index)}
          role="option"
          type="button"
        >
          <IdentityAvatar identity={candidate.id} label={candidate.label} roles={roles} size="sm" />
          <span className="truncate text-[var(--realm-fg)]">{candidate.label}</span>
        </button>
      ))}
    </div>
  );
}
