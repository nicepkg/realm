import type { MessageValue } from "./message-types.ts";
import { chatEn } from "./messages-en/chat.ts";
import { inspectorEn } from "./messages-en/inspector.ts";
import { managerEn } from "./messages-en/manager.ts";
import { navEn } from "./messages-en/nav.ts";
import { sheetsEn } from "./messages-en/sheets.ts";
import { systemEn } from "./messages-en/system.ts";
import { workspaceEn } from "./messages-en/workspace.ts";

/**
 * English (source-of-truth) dictionary, assembled from co-located domain
 * segments. The literal-key shape is preserved here so that `MessageKey`
 * stays a precise union; segments stay under the file-size limit.
 */
export const en = {
  ...navEn,
  ...managerEn,
  ...inspectorEn,
  ...sheetsEn,
  ...workspaceEn,
  ...systemEn,
  ...chatEn,
} satisfies Record<string, MessageValue>;
