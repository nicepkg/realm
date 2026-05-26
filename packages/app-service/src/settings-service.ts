import {
  loadSettingsSnapshot,
  type ProjectConfig,
  type SettingsSnapshot,
  type UserConfig,
  writeProjectConfig,
  writeUserConfig,
} from "@realm/config";

export type { SettingsSnapshot };

export class SettingsService {
  constructor(
    private readonly root: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  getSettings(): Promise<SettingsSnapshot> {
    return loadSettingsSnapshot(this.root, this.env);
  }

  async updateUserSettings(input: UserConfig): Promise<SettingsSnapshot> {
    await writeUserConfig(input, this.env);
    return this.getSettings();
  }

  async updateProjectSettings(input: ProjectConfig): Promise<SettingsSnapshot> {
    await writeProjectConfig(this.root, input);
    return this.getSettings();
  }
}
