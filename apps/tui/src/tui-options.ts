export type TuiOptions = {
  baseUrl?: string;
  worldId?: string;
  roomId?: string;
  identity?: string;
  once?: boolean;
  send?: string;
  assistantGoal?: string;
  showSettings?: boolean;
  locale?: string;
  draftsDir?: string;
};

export function parseTuiOptions(argv: string[]): TuiOptions {
  return {
    baseUrl: readFlag(argv, "--base-url"),
    worldId: readFlag(argv, "--world"),
    roomId: readFlag(argv, "--room"),
    identity: readFlag(argv, "--identity"),
    once: argv.includes("--once"),
    send: readFlag(argv, "--send"),
    assistantGoal: readFlag(argv, "--assistant"),
    showSettings: argv.includes("--settings"),
    locale: readFlag(argv, "--locale"),
    draftsDir: readFlag(argv, "--drafts-dir"),
  };
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
