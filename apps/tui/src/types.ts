import type {
  ConfigPatchProposal,
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  WorldSummary,
} from "@realm/api-contract";

export type TuiState = {
  projectName: string;
  world?: WorldSummary;
  rooms: Room[];
  room?: Room;
  roles: RoleSummary[];
  messages: Message[];
  events: RealmEvent[];
  identity: string;
  settingsSummary?: string;
  assistantProposal?: ConfigPatchProposal;
};

export type TuiCommand =
  | { kind: "quit" }
  | { kind: "help" }
  | { kind: "refresh" }
  | { kind: "settings" }
  | { kind: "model"; provider: string; model: string }
  | { kind: "room"; roomId: string }
  | { kind: "identity"; identity: string }
  | { kind: "send"; content: string }
  | { kind: "assistant"; goal: string };
