"use client";

import {
  AlertTriangleIcon,
  CheckIcon,
  FileCogIcon,
  GavelIcon,
  PlayIcon,
  SearchIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChatCard, ChatCardKind } from "@/state/god-chat-model.ts";

/**
 * Inline God-chat cards — the lightweight preview/confirm and result surfaces
 * rendered INSIDE a conversation turn (never a giant sheet). A `preview` card
 * for the live pending proposal grows confirm / cancel controls; once an action
 * resolves the hook swaps it for a calm read-only `result` card. Pure
 * presentation: every callback + label is supplied by the shell, no SDK imports.
 *
 * The four write families (config / god / state-patch / run-turn) reuse the same
 * compact card chrome so the timeline reads as one coherent surface, with only
 * the leading glyph + accent telling them apart. This is the inline variant of
 * the legacy PatchPreview's data — not the sheet.
 */

/** Localized copy the cards render. zh-CN defaults so the surface is usable even before item 6's chat keys land. */
export type GodChatCardStrings = {
  confirm: string;
  cancel: string;
  /** Risk-tier confirmation: the operator must type this phrase to confirm. */
  typeToConfirmLabel: (phrase: string) => string;
  typeToConfirmPlaceholder: string;
  /**
   * Lightweight assist for typed-confirm on touch: one tap fills the input with
   * the exact phrase so the operator skips character-by-character entry on a
   * narrow screen — they still consciously press confirm afterwards.
   */
  fillPhraseLabel: string;
  /** Accessible name for the fill-phrase assist button. */
  fillPhraseAriaLabel: (phrase: string) => string;
  /** Summary label for the collapsed raw-JSON disclosure on an inspect result card. */
  rawJsonSummary: string;
};

export const defaultGodChatCardStrings: GodChatCardStrings = {
  cancel: "取消",
  confirm: "确认",
  fillPhraseAriaLabel: (phrase) => `填入确认短语「${phrase}」`,
  fillPhraseLabel: "点此填入",
  rawJsonSummary: "查看原始 JSON",
  typeToConfirmLabel: (phrase) => `高风险操作，请输入「${phrase}」以确认`,
  typeToConfirmPlaceholder: "输入确认短语",
};

/** Per-kind leading glyph + single-accent tint token. WeChat green is the only fill, used for confirm. */
const KIND_ICON: Record<ChatCardKind | "inspect", typeof FileCogIcon> = {
  config: FileCogIcon,
  god: GavelIcon,
  inspect: SearchIcon,
  "run-turn": PlayIcon,
  "state-patch": SlidersHorizontalIcon,
  trust: ShieldCheckIcon,
};

export type GodChatCardProps = {
  card: ChatCard;
  /**
   * True only for the single preview card that is the LIVE pending proposal.
   * When false (a superseded preview, or any result card) the card renders
   * read-only with no confirm/cancel — so the timeline never shows two live
   * confirm rows at once.
   */
  isPending?: boolean;
  /**
   * When the live proposal is a risk-tiered config patch, the phrase the
   * operator must type to confirm. `null`/undefined → a plain confirm button.
   */
  confirmationPhrase?: string | null;
  /** Confirm the live proposal. Receives the typed phrase when one is required. */
  onConfirm?: (typedConfirmation?: string) => void;
  /** Cancel the live proposal (no write). */
  onCancel?: () => void;
  busy?: boolean;
  strings?: GodChatCardStrings;
};

export function GodChatCard({
  card,
  isPending = false,
  confirmationPhrase,
  onConfirm,
  onCancel,
  busy = false,
  strings = defaultGodChatCardStrings,
}: GodChatCardProps) {
  // Role speech (F1) renders as a named speaker bubble, NOT an action card — it
  // has no kind/title/confirm. Branch first so the kind-indexed chrome below never
  // sees it.
  if (card.variant === "role-speech") {
    return (
      <RoleSpeechBubble
        detail={card.detail}
        speakerName={card.speakerName}
        streaming={card.streaming}
      />
    );
  }

  const Icon = KIND_ICON[card.kind];
  const isPreview = card.variant === "preview";
  // Only a live preview card with an action wired grows the confirm/cancel row.
  const showActions = isPreview && isPending && Boolean(onConfirm);
  // An inspect result may carry the pretty-printed raw state JSON on a SEPARATE
  // field — rendered behind a collapsed disclosure BELOW the humanized tree so the
  // zh-CN reading in `detail` stays authoritative and never grows a JSON tail.
  const rawJson = card.variant === "result" ? card.rawJson : undefined;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border border-[color:var(--realm-line)] bg-background px-3.5 py-3",
        // A finished action reads as quiet/settled; a live preview reads alert.
        isPreview ? "shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "bg-[color:var(--realm-surface-muted)]",
      )}
      data-card-variant={card.variant}
      data-testid={`god-chat-card-${card.kind}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
            isPreview
              ? "bg-[var(--realm-bubble-outgoing)]/15 text-[#2f6d12]"
              : "bg-[color:var(--realm-line)] text-[color:var(--realm-fg-muted)]",
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[14px] text-[color:var(--realm-fg)] leading-5">
            {card.title}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[color:var(--realm-fg-muted)] leading-5">
            {card.detail}
          </p>
          {rawJson ? <RawJsonDisclosure json={rawJson} summary={strings.rawJsonSummary} /> : null}
        </div>
      </div>
      {showActions ? (
        <ConfirmRow
          busy={busy}
          confirmationPhrase={confirmationPhrase}
          kind={card.kind}
          onCancel={onCancel}
          onConfirm={onConfirm}
          strings={strings}
        />
      ) : null}
    </div>
  );
}

type RoleSpeechBubbleProps = {
  speakerName: string;
  detail: string;
  /** True while tokens are still streaming in — shows a typing indicator. */
  streaming: boolean;
};

/**
 * A role's in-world line, folded into the NL conversation (F1). Rendered as a
 * named speaker bubble — distinct from the operator's green bubble and from
 * God/system replies — so the operator sees a role talk without opening "高级".
 * While streaming, a three-dot typing indicator follows the growing text (the
 * global reduced-motion guard neutralizes its animation).
 */
function RoleSpeechBubble({ speakerName, detail, streaming }: RoleSpeechBubbleProps) {
  return (
    <div
      className="flex w-full flex-col gap-1"
      data-card-variant="role-speech"
      data-streaming={streaming ? "true" : "false"}
      data-testid="god-chat-role-speech"
    >
      <span className="font-medium text-[12px] text-[color:var(--realm-fg-muted)]">
        {speakerName}
      </span>
      {/*
       * The reply bubble fills the full card column (`w-full`) instead of hugging
       * its intrinsic content width — on a wide desktop the narrow left-aligned
       * bubble left the right ~half of the column empty, so a run-turn reply read
       * as sparse. A role line is an answer meant to be READ, like the inspect
       * tree, so it gets the full reading measure; the leading speaker name + the
       * `rounded-tl-sm` corner still mark it as an in-world speaker, not God.
       */}
      <div className="w-full rounded-xl rounded-tl-sm border border-[color:var(--realm-line)] bg-[color:var(--realm-surface-muted)] px-3.5 py-2">
        <p className="whitespace-pre-wrap break-words text-[14px] text-[color:var(--realm-fg)] leading-[1.5]">
          {detail}
          {streaming ? (
            <span aria-hidden className="realm-dots ml-1 inline-flex gap-0.5 align-middle">
              <span className="inline-block size-1 rounded-full bg-[color:var(--realm-fg-faint)]" />
              <span className="inline-block size-1 rounded-full bg-[color:var(--realm-fg-faint)]" />
              <span className="inline-block size-1 rounded-full bg-[color:var(--realm-fg-faint)]" />
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

type RawJsonDisclosureProps = {
  json: string;
  summary: string;
};

/**
 * Collapsed power-inspect disclosure for an inspect result's raw state JSON.
 * Default closed so the humanized zh-CN tree above is what the operator reads;
 * the native <details>/<summary> is keyboard-accessible (Enter/Space toggles) and
 * needs no JS or animation, so it is reduced-motion safe by construction.
 */
function RawJsonDisclosure({ json, summary }: RawJsonDisclosureProps) {
  return (
    <details className="mt-2 text-[12px]" data-testid="god-chat-card-raw-json">
      <summary className="cursor-pointer select-none text-[color:var(--realm-fg-faint)] hover:text-[color:var(--realm-fg-muted)]">
        {summary}
      </summary>
      <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[color:var(--realm-line)]/40 px-2.5 py-2 font-mono text-[11px] text-[color:var(--realm-fg-muted)] leading-[1.5]">
        {json}
      </pre>
    </details>
  );
}

type ConfirmRowProps = {
  kind: ChatCardKind;
  confirmationPhrase?: string | null;
  onConfirm?: (typedConfirmation?: string) => void;
  onCancel?: () => void;
  busy: boolean;
  strings: GodChatCardStrings;
};

/**
 * Pure confirm-gating rule shared by the input handler, the fill-phrase assist,
 * and the submit guard — so "typed matches the required phrase" is decided in one
 * place. `null`/empty phrase → a plain confirm (always allowed when not busy).
 */
export function confirmGate(args: {
  confirmationPhrase?: string | null;
  typed: string;
  busy: boolean;
}): { requiresPhrase: boolean; phraseMatches: boolean; canConfirm: boolean } {
  const { confirmationPhrase, typed, busy } = args;
  const requiresPhrase = typeof confirmationPhrase === "string" && confirmationPhrase.length > 0;
  const phraseMatches = !requiresPhrase || typed.trim() === confirmationPhrase;
  return { canConfirm: !busy && phraseMatches, phraseMatches, requiresPhrase };
}

/**
 * The confirm / cancel affordance for a live preview. A high-risk config patch
 * (non-null `confirmationPhrase`) gates confirm behind typing the exact phrase
 * (Don Norman: deliberate friction for irreversible writes); everything else is
 * a single confirm button. Keyboard-accessible: it is a real form, Enter submits.
 */
function ConfirmRow({
  kind,
  confirmationPhrase,
  onConfirm,
  onCancel,
  busy,
  strings,
}: ConfirmRowProps) {
  const [typed, setTyped] = useState("");
  const phraseInputId = `god-chat-card-${kind}-phrase-input`;
  const { requiresPhrase, canConfirm } = confirmGate({ busy, confirmationPhrase, typed });

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canConfirm) {
        return;
      }
      onConfirm?.(requiresPhrase ? typed.trim() : undefined);
    },
    [canConfirm, onConfirm, requiresPhrase, typed],
  );

  // One-tap fill for narrow screens: drop the exact phrase into the input so the
  // confirm button unlocks, WITHOUT submitting — the operator still presses
  // confirm, preserving the deliberate second action for irreversible writes.
  const handleFillPhrase = useCallback(() => {
    if (requiresPhrase) {
      setTyped(confirmationPhrase as string);
    }
  }, [confirmationPhrase, requiresPhrase]);

  return (
    <form className="mt-1 flex flex-col gap-2" onSubmit={handleSubmit}>
      {requiresPhrase ? (
        <div className="flex flex-col gap-1.5 text-[12px] text-[color:var(--realm-fg-muted)]">
          <label className="flex items-center gap-1.5" htmlFor={phraseInputId}>
            <AlertTriangleIcon className="size-3.5 text-[var(--realm-warning)]" />
            {strings.typeToConfirmLabel(confirmationPhrase as string)}
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              autoComplete="off"
              className="h-8 flex-1 text-[13px]"
              data-testid={`god-chat-card-${kind}-phrase`}
              id={phraseInputId}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={strings.typeToConfirmPlaceholder}
              value={typed}
            />
            <button
              aria-label={strings.fillPhraseAriaLabel(confirmationPhrase as string)}
              className="shrink-0 rounded-md px-1.5 py-1 text-[12px] text-[#2f6d12] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none disabled:opacity-50"
              data-testid={`god-chat-card-${kind}-phrase-fill`}
              disabled={busy}
              onClick={handleFillPhrase}
              type="button"
            >
              {strings.fillPhraseLabel}
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          className="h-8 rounded-lg px-3 text-[13px]"
          data-testid={`god-chat-card-${kind}-cancel`}
          disabled={busy}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          {strings.cancel}
        </Button>
        <Button
          className="h-8 rounded-lg bg-[var(--realm-bubble-outgoing)] px-3.5 text-[13px] text-[#10210a] hover:bg-[var(--realm-bubble-outgoing)]/90"
          data-testid={`god-chat-card-${kind}-confirm`}
          disabled={!canConfirm}
          size="sm"
          type="submit"
        >
          <CheckIcon className="size-3.5" />
          {strings.confirm}
        </Button>
      </div>
    </form>
  );
}
