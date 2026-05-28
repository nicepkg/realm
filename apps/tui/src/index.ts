import { stdout as output } from "node:process";
import { RealmTuiApp } from "./realm-tui-app.ts";
import { parseTuiOptions } from "./tui-options.ts";

export { RealmTuiApp } from "./realm-tui-app.ts";
export type { TuiOptions } from "./tui-options.ts";

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
