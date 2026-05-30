import type { Locale, useI18n } from "@/i18n/index.tsx";

/**
 * Consequence + state copy for the Simulation tab. It lives here, not in the
 * shared i18n dicts: those dicts are owned by the realm-i18n-leaks item, and the
 * existing risk/confirm keys (`sheet.god.*`, `sheet.config.*`) describe
 * rollback-able patches, which is the opposite of an irreversible tick advance.
 * To keep new literals out of the dicts while still rendering proper zh-CN/en,
 * these are file-local, keyed by the active locale, and re-exported from
 * `world-simulation-tab.tsx` so consumers/tests have one import surface.
 */
export const consequenceCopy: Record<
  Locale,
  {
    runTitle: string;
    runBody: (world: string, ticks: number) => string;
    forkTitle: string;
    forkBody: (label: string) => string;
    irreversible: string;
    runNotice: (clock: number, events: number) => string;
    forkNotice: (label: string) => string;
    pauseNotice: string;
    resumeNotice: string;
    loading: string;
    groupStatus: string;
    groupAdvance: string;
    runUninterruptible: string;
    runElapsed: (elapsed: string) => string;
    runTickReadout: (clock: number) => string;
  }
> = {
  "zh-CN": {
    runTitle: "推进世界？",
    runBody: (world, ticks) => `推进世界 ${world} ${ticks} 个回合将写入世界状态，无法自动撤销。`,
    forkTitle: "创建世界分支？",
    // L6-R2-3: use the same "世界分支" term as forkTitle/forkNotice, drop the raw
    // English verb "Fork" so the zh-CN body reads as Chinese end to end.
    forkBody: (label) => `创建世界分支 ${label} 将写入磁盘。`,
    irreversible: "运行时无法自动撤销推进的回合，请确认后再继续。",
    runNotice: (clock, events) => `已推进至时钟 ${clock}，写入 ${events} 个事件。`,
    forkNotice: (label) => `已创建分支 ${label}。`,
    pauseNotice: "已暂停世界推进。",
    resumeNotice: "已恢复世界推进。",
    loading: "正在读取仿真状态…",
    groupStatus: "状态",
    groupAdvance: "推进 / 分叉",
    runUninterruptible: "运行中无法中断，请等待完成。",
    runElapsed: (elapsed) => `已运行 ${elapsed}`,
    runTickReadout: (clock) => `当前时钟 ${clock}`,
  },
  en: {
    runTitle: "Advance world?",
    runBody: (world, ticks) =>
      `Advancing world ${world} by ${ticks} ticks writes world state and cannot be automatically undone.`,
    forkTitle: "Create world fork?",
    forkBody: (label) => `Fork will create the world branch ${label} and write it to disk.`,
    irreversible:
      "The runtime cannot automatically revert advanced ticks. Confirm before you continue.",
    runNotice: (clock, events) => `Advanced to tick ${clock}, wrote ${events} events.`,
    forkNotice: (label) => `Created fork ${label}.`,
    pauseNotice: "Paused the simulation.",
    resumeNotice: "Resumed the simulation.",
    loading: "Loading simulation status…",
    groupStatus: "Status",
    groupAdvance: "Advance / branch",
    runUninterruptible: "This run cannot be cancelled mid-flight; please wait for it to finish.",
    runElapsed: (elapsed) => `Elapsed ${elapsed}`,
    runTickReadout: (clock) => `Tick ${clock}`,
  },
};

export type SimulationCopy = (typeof consequenceCopy)[Locale];

export type PendingConfirm =
  | { kind: "run"; ticks: number }
  | { kind: "fork"; label: string }
  | undefined;

export type Outcome =
  | { kind: "run"; clock: number; events: number }
  | { kind: "fork"; label: string }
  | { kind: "export"; events: number }
  | { kind: "pause" }
  | { kind: "resume" }
  | undefined;

/** Maps a completed action outcome to its localized green-notice sentence. */
export function outcomeText(
  outcome: NonNullable<Outcome>,
  copy: SimulationCopy,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (outcome.kind === "run") {
    return copy.runNotice(outcome.clock, outcome.events);
  }
  if (outcome.kind === "fork") {
    return copy.forkNotice(outcome.label);
  }
  if (outcome.kind === "pause") {
    return copy.pauseNotice;
  }
  if (outcome.kind === "resume") {
    return copy.resumeNotice;
  }
  return `${t("inspector.simExported")}: ${outcome.events}`;
}
