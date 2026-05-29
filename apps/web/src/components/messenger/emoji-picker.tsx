import { Smile } from "lucide-react";
import { type RefObject, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n/index.tsx";

/**
 * A small WeChat-density emoji grid. Selecting one inserts it at the textarea's
 * caret (not blindly appended) and refocuses the input so the user keeps typing
 * exactly where they were — the direct fix for the old single-🙂 stub that only
 * ever appended one fixed face (a dead/fake control, taste-bar violation).
 *
 * The picker needs no new dictionary strings: it reuses workspace.emoji for the
 * trigger aria-label and the emoji themselves are language-neutral.
 */

// A compact, common set — 24 faces/hands matching WeChat-chat density. Kept as a
// flat module constant so the grid is stable and never re-allocated per render.
const COMMON_EMOJI = [
  "😀",
  "😄",
  "😅",
  "😂",
  "🙂",
  "😉",
  "😍",
  "😘",
  "😎",
  "🤔",
  "😴",
  "😭",
  "😡",
  "😱",
  "🥳",
  "😇",
  "👍",
  "👎",
  "👌",
  "🙏",
  "👏",
  "💪",
  "🎉",
  "❤️",
] as const;

export function EmojiPicker({
  inputRef,
  onInsert,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Insert `emoji` at `caret`, returning the caret position after the insert. */
  onInsert: (emoji: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  function pick(emoji: string) {
    onInsert(emoji);
    setOpen(false);
    // Refocus the textarea after the popover closes and React commits the new
    // draft so the user can keep typing where the caret now sits.
    const textarea = inputRef.current;
    if (textarea) {
      requestAnimationFrame(() => textarea.focus());
    }
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("workspace.emoji")}
          className="size-9 rounded-[8px]"
          data-testid="composer-emoji"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Smile className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        data-testid="composer-emoji-popover"
        side="top"
      >
        <div className="grid grid-cols-8 gap-0.5" role="listbox">
          {COMMON_EMOJI.map((emoji) => (
            <button
              aria-label={emoji}
              className="flex size-8 items-center justify-center rounded-[6px] text-[18px] leading-none transition-colors hover:bg-[var(--realm-surface-muted)] focus-visible:bg-[var(--realm-surface-muted)] focus-visible:outline-none"
              data-testid={`composer-emoji-option-${emoji}`}
              key={emoji}
              onClick={() => pick(emoji)}
              role="option"
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
