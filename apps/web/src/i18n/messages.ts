import { type Locale, locales, type MessageValue } from "./message-types.ts";
import { en } from "./messages-en.ts";
import { zhCN } from "./messages-zh-cn.ts";

export type { Locale, MessageValue };
export { locales };

export const dictionaries = {
  en,
  "zh-CN": zhCN,
} satisfies Record<Locale, Record<string, MessageValue>>;

export type MessageKey = keyof typeof dictionaries.en;

/** Keys whose value is a static string (the common case). */
export type StringMessageKey = {
  [K in MessageKey]: (typeof dictionaries.en)[K] extends string ? K : never;
}[MessageKey];

/** Keys whose value is a builder function (plural-aware counts, etc.). */
export type FnMessageKey = Exclude<MessageKey, StringMessageKey>;
