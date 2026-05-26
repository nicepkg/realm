import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { RealmHttpClient } from "@realm/client-sdk";
import { parseTuiCommand, renderTuiHelp } from "./commands.ts";
import type { TuiCommand, TuiState } from "./types.ts";
import { renderTui } from "./view-model.ts";

export type TuiOptions = {
  baseUrl?: string;
  worldId?: string;
  roomId?: string;
  identity?: string;
  once?: boolean;
  send?: string;
  assistantGoal?: string;
  showSettings?: boolean;
};

export async function runTui(argv: string[]): Promise<void> {
  const options = parseTuiOptions(argv);
  const app = new RealmTuiApp(options);
  if (options.send) {
    await app.send(options.send);
  }
  if (options.assistantGoal) {
    await app.proposeAssistant(options.assistantGoal);
  }
  if (options.showSettings) {
    await app.loadSettingsSummary();
  }
  if (options.once || options.send || options.assistantGoal || options.showSettings) {
    output.write(`${await app.render()}\n`);
    return;
  }
  await app.runInteractive();
}

export class RealmTuiApp {
  private readonly client: RealmHttpClient;
  private state: TuiState | undefined;

  constructor(private readonly options: TuiOptions = {}) {
    this.client = new RealmHttpClient({ baseUrl: options.baseUrl ?? "http://127.0.0.1:3737" });
  }

  async render(): Promise<string> {
    return renderTui(await this.load());
  }

  async send(content: string): Promise<void> {
    const state = await this.load();
    if (!state.world || !state.room) {
      throw new Error("Cannot send without an active world and room.");
    }
    await this.client.sendMessage(state.room.id, {
      worldId: state.world.id,
      displayedAuthorId: state.identity,
      content,
      idempotencyKey: `tui-message-${Date.now()}`,
    });
    await this.reload();
  }

  async proposeAssistant(goal: string): Promise<void> {
    const payload = await this.client.proposeAssistantConfig({ goal });
    this.state = { ...(await this.load()), assistantProposal: payload.patch };
  }

  async loadSettingsSummary(): Promise<void> {
    const settings = await this.client.getSettings();
    this.state = {
      ...(await this.load()),
      settingsSummary: `${settings.user.defaultProvider}/${settings.user.defaultModel}`,
    };
  }

  async updateDefaultModel(provider: string, model: string): Promise<void> {
    const settings = await this.client.getSettings();
    const updated = await this.client.updateUserSettings({
      ...settings.user,
      defaultProvider: provider,
      defaultModel: model,
    });
    this.state = {
      ...(await this.load()),
      settingsSummary: `${updated.user.defaultProvider}/${updated.user.defaultModel}`,
    };
  }

  async runInteractive(): Promise<void> {
    const terminal = createInterface({ input, output });
    try {
      output.write(`${await this.render()}\n`);
      output.write(`${renderTuiHelp()}\n`);
      for (;;) {
        const command = parseTuiCommand(await terminal.question("realm> "));
        if (command.kind === "quit") {
          return;
        }
        await this.handle(command);
        output.write(`${await this.render()}\n`);
      }
    } finally {
      terminal.close();
    }
  }

  private async handle(command: TuiCommand): Promise<void> {
    if (command.kind === "help") {
      output.write(`${renderTuiHelp()}\n`);
      return;
    }
    if (command.kind === "refresh") {
      await this.reload();
      return;
    }
    if (command.kind === "settings") {
      await this.loadSettingsSummary();
      return;
    }
    if (command.kind === "model") {
      await this.updateDefaultModel(command.provider, command.model);
      return;
    }
    if (command.kind === "identity") {
      this.state = { ...(await this.load()), identity: command.identity };
      return;
    }
    if (command.kind === "room") {
      this.state = await this.load(command.roomId);
      return;
    }
    if (command.kind === "assistant") {
      await this.proposeAssistant(command.goal);
      return;
    }
    if (command.kind === "send") {
      await this.send(command.content);
    }
  }

  private async reload(): Promise<void> {
    this.state = undefined;
    await this.load();
  }

  private async load(roomOverride?: string): Promise<TuiState> {
    if (this.state && !roomOverride) {
      return this.state;
    }
    const effective = await this.client.getEffectiveConfig();
    const world =
      effective.worlds.find((candidate) => candidate.id === this.options.worldId) ??
      effective.worlds.find((candidate) => candidate.id === effective.project.defaultWorldId) ??
      effective.worlds[0];
    const rooms = world ? (await this.client.listRooms(world.id)).rooms : [];
    const room =
      rooms.find((candidate) => candidate.id === (roomOverride ?? this.options.roomId)) ??
      rooms.find((candidate) => candidate.id === world?.defaultRoomId) ??
      rooms[0];
    const messages = room ? (await this.client.listMessages(room.id)).messages : [];
    const events = (await this.client.listEvents()).events;
    this.state = {
      projectName: effective.project.name,
      world,
      rooms,
      room,
      roles: effective.roles,
      messages,
      events,
      identity: this.options.identity ?? this.state?.identity ?? "owner",
      settingsSummary: this.state?.settingsSummary,
      assistantProposal: this.state?.assistantProposal,
    };
    return this.state;
  }
}

function parseTuiOptions(argv: string[]): TuiOptions {
  return {
    baseUrl: readFlag(argv, "--base-url"),
    worldId: readFlag(argv, "--world"),
    roomId: readFlag(argv, "--room"),
    identity: readFlag(argv, "--identity"),
    once: argv.includes("--once"),
    send: readFlag(argv, "--send"),
    assistantGoal: readFlag(argv, "--assistant"),
    showSettings: argv.includes("--settings"),
  };
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
