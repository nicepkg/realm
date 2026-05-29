import type { TuiCommand } from "./types.ts";

/**
 * Facade of the app handlers the command router needs. Keeping the long
 * command-kind dispatch out of {@link RealmTuiApp} (which must stay under the
 * file-size budget) without leaking the app's private state: the app passes a
 * small object of bound handlers and the router maps each command kind to one.
 * Send / draft / quit / overlay commands are resolved earlier in the app, so
 * they never reach here.
 */
export type TuiCommandHandlers = {
  switchWorld(worldId: string): Promise<string>;
  switchRoom(roomId: string): Promise<string>;
  createRoom(command: Extract<TuiCommand, { kind: "createRoom" }>): Promise<string>;
  createWorld(command: Extract<TuiCommand, { kind: "createWorld" }>): Promise<string>;
  createRole(command: Extract<TuiCommand, { kind: "createRole" }>): Promise<string>;
  controlSimulation(command: Extract<TuiCommand, { kind: "sim" }>): Promise<string>;
  rollbackConfig(command: Extract<TuiCommand, { kind: "rollback" }>): Promise<string>;
  switchLocale(command: Extract<TuiCommand, { kind: "locale" }>): Promise<string>;
  requestRoleTurn(command: Extract<TuiCommand, { kind: "runRole" }>): Promise<string>;
  requestIdentitySwitch(identity: string): Promise<string>;
  inspectWorldState(path?: string): Promise<string>;
  inspectRoleMemory(roleId: string): Promise<string>;
  patchPreview(): Promise<string>;
  patchReject(): Promise<string>;
  patchApply(command: Extract<TuiCommand, { kind: "patchApply" }>): Promise<string>;
  requestModelChange(command: Extract<TuiCommand, { kind: "model" }>): Promise<string>;
  requestGodAction(command: Extract<TuiCommand, { kind: "god" }>): Promise<string>;
  /** Fallthrough for help/refresh/settings/assistant. */
  fallthrough(command: TuiCommand): Promise<string>;
};

/** Routes a parsed command to the matching handler, mirroring the original chain. */
export function routeTuiCommand(
  handlers: TuiCommandHandlers,
  command: TuiCommand,
): Promise<string> {
  switch (command.kind) {
    case "world":
      return handlers.switchWorld(command.worldId);
    case "room":
      return handlers.switchRoom(command.roomId);
    case "createRoom":
      return handlers.createRoom(command);
    case "createWorld":
      return handlers.createWorld(command);
    case "createRole":
      return handlers.createRole(command);
    case "sim":
      return handlers.controlSimulation(command);
    case "rollback":
      return handlers.rollbackConfig(command);
    case "locale":
      return handlers.switchLocale(command);
    case "runRole":
      return handlers.requestRoleTurn(command);
    case "identity":
      return handlers.requestIdentitySwitch(command.identity);
    case "state":
      return handlers.inspectWorldState(command.path);
    case "memory":
      return handlers.inspectRoleMemory(command.roleId);
    case "patchPreview":
      return handlers.patchPreview();
    case "patchReject":
      return handlers.patchReject();
    case "patchApply":
      return handlers.patchApply(command);
    case "model":
      return handlers.requestModelChange(command);
    case "god":
      return handlers.requestGodAction(command);
    default:
      return handlers.fallthrough(command);
  }
}
