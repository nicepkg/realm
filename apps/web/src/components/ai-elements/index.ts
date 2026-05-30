/**
 * AI Elements barrel — the assembled chat primitives for Realm's
 * natural-language-first surface. Callers import everything from here so the
 * NL chat window assembles drag-in primitives rather than hand-rolling UI.
 */

export type {
  ConversationContentProps,
  ConversationDownloadProps,
  ConversationEmptyStateProps,
  ConversationProps,
  ConversationScrollButtonProps,
} from "./conversation.tsx";
// Conversation scaffold (scroll container, content, empty state, scroll-to-bottom, download).
export {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
  messagesToMarkdown,
} from "./conversation.tsx";
export type { OperatorMessageProps, OperatorMessageVariant } from "./operator-message.tsx";
// One conversation turn (operator vs. God/system) with an inline card slot.
export { OperatorMessage } from "./operator-message.tsx";
export type { PromptInputProps } from "./prompt-input.tsx";
// The Apple-flat composer.
export { PromptInput } from "./prompt-input.tsx";
export type { TextShimmerProps } from "./shimmer.tsx";
// Streaming/thinking placeholder text.
export { Shimmer } from "./shimmer.tsx";
export type { Suggestion, SuggestionsProps } from "./suggestions.tsx";
// Starter-prompt pill row for the empty state.
export { Suggestions } from "./suggestions.tsx";
