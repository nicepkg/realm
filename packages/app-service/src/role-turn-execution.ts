import path from "node:path";
import { projectLayout } from "@realm/config";
import type { Message } from "@realm/core";
import type { PiBridge } from "@realm/pi-bridge";
import { PiRoleTurnRunner } from "@realm/runtime";
import type { EventStore } from "@realm/storage";
import type { ExtensionAccessService } from "./extension-access-service.ts";
import { resolveRoleModelSettings } from "./model-resolution-service.ts";
import {
  compileRoleSystemPrompt,
  loadRoleTurnContext,
  toPiAllowedSkills,
} from "./role-turn-context.ts";
import type { SettingsSnapshot } from "./settings-service.ts";
import { assertSafePathSegment, resolvePiExtensionPaths } from "./support.ts";
import type { RunRoleTurnInput } from "./types.ts";

const DEFAULT_TURN_TIMEOUT_MS = 60_000;

/**
 * Collaborators a single role turn needs from the application service. Passed
 * explicitly (rather than reaching back into the service) so the execution
 * path stays decoupled and unit-testable.
 */
export type RoleTurnExecutionDeps = {
  root: string;
  eventStore: EventStore;
  clock: () => Date;
  piBridge: PiBridge;
  extensionAccessService: ExtensionAccessService;
  fakeRuntime: boolean;
  extensionBaseUrl: string | undefined;
  piExtensionPath: string | undefined;
  env: NodeJS.ProcessEnv | undefined;
  listRoles: () => Promise<Awaited<ReturnType<typeof loadRoleTurnContext>>["role"][] | unknown[]>;
  getSettings: () => Promise<SettingsSnapshot>;
};

/**
 * Run one role turn end to end: resolve the role context and model, open a
 * scoped extension session, drive PiRoleTurnRunner, and clean up. In fake
 * runtime mode the model is a deterministic "fake" identity and the injected
 * FakePiBridge answers without a real provider, so turns complete offline.
 */
export async function executeRoleTurn(
  deps: RoleTurnExecutionDeps,
  input: RunRoleTurnInput,
): Promise<{ turnId: string; message: Message }> {
  assertSafePathSegment(input.worldId, "worldId");
  assertSafePathSegment(input.roomId, "roomId");
  assertSafePathSegment(input.roleId, "roleId");
  const roleContext = await loadRoleTurnContext({
    root: deps.root,
    worldId: input.worldId,
    roleId: input.roleId,
    roles: (await deps.listRoles()) as never,
  });
  if (!roleContext.role) {
    throw new Error(`Unknown role: ${input.roleId}`);
  }
  const layout = projectLayout(deps.root);
  const runner = new PiRoleTurnRunner(deps.piBridge, deps.eventStore, deps.clock);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const extensionSession = deps.extensionAccessService.createSession({
    worldId: input.worldId,
    roleId: input.roleId,
    expiresAt: new Date(deps.clock().getTime() + timeoutMs + 30_000),
  });
  // The fake bridge ignores provider/model and never calls a real provider, so
  // skip provider resolution (which would otherwise require configured secrets)
  // and feed it a deterministic "fake" model identity instead.
  const modelSettings = deps.fakeRuntime
    ? { provider: "fake", model: "fake", env: {} }
    : resolveRoleModelSettings({
        settings: await deps.getSettings(),
        roleModel: roleContext.role.model,
        env: deps.env,
      });

  try {
    const result = await runner.run({
      turnId: input.turnId,
      worldId: input.worldId,
      roomId: input.roomId,
      roleId: input.roleId,
      prompt:
        input.prompt ?? `Reply to the latest room context as ${roleContext.role.displayName}.`,
      cwd: deps.root,
      sessionDir: path.join(
        layout.stateDir,
        "pi-sessions",
        input.worldId,
        input.roomId,
        input.roleId,
      ),
      systemPrompt: compileRoleSystemPrompt(roleContext),
      provider: modelSettings.provider,
      model: modelSettings.model,
      allowedSkills: toPiAllowedSkills(roleContext.callableSkills),
      allowedSkillPaths: roleContext.callableSkills.map((skill) => skill.path),
      extensionPaths: await resolvePiExtensionPaths(
        deps.piExtensionPath ?? process.env.REALM_PI_EXTENSION_PATH,
      ),
      env: {
        ...modelSettings.env,
        REALM_EXTENSION_BASE_URL: deps.extensionBaseUrl ?? "http://127.0.0.1:3737",
        REALM_EXTENSION_TOKEN: extensionSession.token,
        REALM_EXTENSION_WORLD_ID: input.worldId,
        REALM_EXTENSION_ROLE_ID: input.roleId,
      },
      signal: input.signal,
      timeoutMs,
    });
    return { turnId: result.turn.id, message: result.message };
  } finally {
    deps.extensionAccessService.deleteSession(extensionSession.tokenHash);
  }
}
