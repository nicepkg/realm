export const locales = ["en", "zh-CN"] as const;
export type Locale = (typeof locales)[number];

/**
 * A dictionary entry is either a static string or a function that builds a
 * string from runtime arguments (e.g. plural-aware counts). Function-valued
 * entries let us localize grammar (singular/plural) without leaking
 * count+noun composition into render code.
 */
export type MessageValue = string | ((...args: never[]) => string);
