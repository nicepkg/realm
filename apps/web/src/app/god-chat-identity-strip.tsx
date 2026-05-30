"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GodChatShellStrings } from "./god-chat-shell.tsx";

type OperatorContext = {
  provider?: string;
  model?: string;
  isMockRuntime: boolean;
};

export type WorldIdentityStripProps = {
  worldName?: string;
  modeLabel?: string;
  operator: OperatorContext;
  advancedLabel: string;
  onOpenAdvanced: () => void;
  strings: GodChatShellStrings;
};

/**
 * The compact world-identity strip: world name + mode on the left, the provider
 * / model (or the mock-runtime hint) in the middle, and the single demoted "高级"
 * button on the right. This is the ONLY persistent control besides the composer.
 *
 * Extracted out of god-chat-shell.tsx to keep that shell under the 500-line
 * guard; it owns no state and is a pure presentational strip over the same
 * OperatorContext the shell resolves.
 */
export function WorldIdentityStrip({
  worldName,
  modeLabel,
  operator,
  advancedLabel,
  onOpenAdvanced,
  strings,
}: WorldIdentityStripProps) {
  const providerLine = operator.isMockRuntime
    ? strings.mockRuntime
    : [operator.provider, operator.model].filter(Boolean).join(" · ");

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-3 border-[color:var(--realm-line)] border-b bg-[var(--realm-bg)] px-4 pt-[env(safe-area-inset-top)]"
      data-testid="god-chat-identity-strip"
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-semibold text-[15px] text-[color:var(--realm-fg)]">
          {worldName ?? strings.noWorld}
        </span>
        {modeLabel ? (
          <span className="shrink-0 rounded-full bg-[color:var(--realm-surface-muted)] px-2 py-0.5 text-[11px] text-[color:var(--realm-fg-muted)]">
            {modeLabel}
          </span>
        ) : null}
      </div>
      {providerLine ? (
        <span
          className="hidden max-w-[40%] truncate text-[12px] text-[color:var(--realm-fg-faint)] sm:inline"
          data-testid="god-chat-provider-line"
        >
          {providerLine}
        </span>
      ) : null}
      <Button
        className="h-8 shrink-0 rounded-lg px-3 text-[13px]"
        data-testid="god-chat-advanced"
        onClick={onOpenAdvanced}
        size="sm"
        variant="ghost"
      >
        <SlidersHorizontalIcon className="size-3.5" />
        {advancedLabel}
      </Button>
    </header>
  );
}
