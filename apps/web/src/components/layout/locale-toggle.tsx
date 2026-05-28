import { Languages } from "lucide-react";
import { type Locale, locales, useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils";

/**
 * Short, self-explanatory glyph for each locale. Kept here (not in the
 * dictionary) because it is the same in every UI language — it labels the
 * target locale, not the current one.
 */
const LOCALE_GLYPH: Record<Locale, string> = {
  en: "EN",
  "zh-CN": "中",
};

/**
 * Persistent, always-mounted language switcher.
 *
 * Lives in the app shell so it is reachable from both the World Manager and the
 * Workspace without opening Settings. It is a flat segmented control (no green
 * accent) and writes through the i18n context, which persists the choice to
 * localStorage.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      aria-label={t("sheet.settings.language")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[var(--realm-line)] bg-white/90 p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur",
        className,
      )}
      data-testid="locale-toggle"
      role="toolbar"
    >
      <Languages aria-hidden="true" className="ml-1.5 size-3.5 text-[#86868b]" />
      {locales.map((value) => {
        const active = value === locale;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "min-w-7 rounded-full px-2 py-1 text-[12px] leading-none transition-colors",
              active ? "bg-[#1d1d1f] font-medium text-white" : "text-[#6e6e73] hover:bg-[#f1f1f2]",
            )}
            data-testid={`locale-toggle-${value}`}
            key={value}
            onClick={() => setLocale(value)}
            type="button"
          >
            {LOCALE_GLYPH[value]}
          </button>
        );
      })}
    </div>
  );
}
