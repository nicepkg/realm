import type { TuiCommand } from "./types.ts";

export function parseTuiCommand(input: string): TuiCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: "refresh" };
  }
  if (trimmed === ":q" || trimmed === ":quit" || trimmed === "quit") {
    return { kind: "quit" };
  }
  if (trimmed === ":h" || trimmed === ":help" || trimmed === "help") {
    return { kind: "help" };
  }
  if (trimmed === ":r" || trimmed === ":refresh" || trimmed === "refresh") {
    return { kind: "refresh" };
  }
  if (trimmed === ":settings" || trimmed === "settings") {
    return { kind: "settings" };
  }
  const [head, ...tail] = trimmed.split(/\s+/);
  const rest = tail.join(" ").trim();
  if ((head === ":model" || head === "model") && tail.length >= 2) {
    return { kind: "model", provider: tail[0] ?? "", model: tail.slice(1).join(" ") };
  }
  if ((head === ":room" || head === "room") && rest) {
    return { kind: "room", roomId: rest };
  }
  if ((head === ":id" || head === ":identity" || head === "identity") && rest) {
    return { kind: "identity", identity: rest };
  }
  if ((head === ":assistant" || head === "assistant") && rest) {
    return { kind: "assistant", goal: rest };
  }
  if ((head === ":send" || head === "send") && rest) {
    return { kind: "send", content: rest };
  }
  return { kind: "send", content: trimmed.replace(/^:/, "") };
}

export function renderTuiHelp(): string {
  return [
    "Commands:",
    "  :send <message>        send as current identity",
    "  :id <identity>         switch speaking identity",
    "  :room <room-id>        switch room",
    "  :assistant <goal>      propose a config patch",
    "  :settings              show settings summary",
    "  :model <provider> <id>  update default model settings",
    "  :refresh               reload project state",
    "  :q                     quit",
  ].join("\n");
}
