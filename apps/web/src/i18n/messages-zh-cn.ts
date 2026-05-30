import type { MessageValue } from "./message-types.ts";
import { chatZhCn } from "./messages-zh-cn/chat.ts";
import { inspectorZhCn } from "./messages-zh-cn/inspector.ts";
import { managerZhCn } from "./messages-zh-cn/manager.ts";
import { navZhCn } from "./messages-zh-cn/nav.ts";
import { sheetsZhCn } from "./messages-zh-cn/sheets.ts";
import { systemZhCn } from "./messages-zh-cn/system.ts";
import { workspaceZhCn } from "./messages-zh-cn/workspace.ts";

/**
 * Simplified Chinese dictionary, assembled from co-located domain segments
 * mirroring the English split. Keys must stay in parity with `en`; segments
 * stay under the file-size limit.
 */
export const zhCN = {
  ...navZhCn,
  ...managerZhCn,
  ...inspectorZhCn,
  ...sheetsZhCn,
  ...workspaceZhCn,
  ...systemZhCn,
  ...chatZhCn,
} satisfies Record<string, MessageValue>;
