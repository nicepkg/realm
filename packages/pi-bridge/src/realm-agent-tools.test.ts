import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildRealmAgentTools } from "./realm-agent-tools.ts";
import type { PiSessionStartInput } from "./types.ts";

describe("buildRealmAgentTools", () => {
  test("adds a package-first skill read tool for allowed callable skills", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-pi-tools-"));
    const skillDir = path.join(root, "note-taker");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      "# Note Taker\n\nCapture durable notes.\n",
      "utf8",
    );

    const tools = buildRealmAgentTools(
      sessionInput({
        allowedSkills: [
          {
            id: "role-private:note-taker",
            name: "note-taker",
            scope: "role-private",
            path: skillDir,
            contentHash: "hash-1",
          },
        ],
        allowedSkillPaths: [skillDir],
      }),
    );
    const skillTool = tools.find((tool) => tool.name === "realm_skill_read");

    expect(tools.map((tool) => tool.name)).toContain("realm_skill_read");
    const result = await skillTool?.execute("tool-1", { name: "role-private:note-taker" });

    expect(result?.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Capture durable notes."),
    });
    expect(result?.details).toEqual({
      id: "role-private:note-taker",
      name: "note-taker",
      scope: "role-private",
      contentHash: "hash-1",
    });
  });

  test("rejects ambiguous name-only skill reads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-pi-tools-"));
    const privateSkillDir = path.join(root, "roles", "leijun", "skills", "note-taker");
    const worldSkillDir = path.join(root, "worlds", "cultivation", "skills", "note-taker");
    await mkdir(privateSkillDir, { recursive: true });
    await mkdir(worldSkillDir, { recursive: true });
    await writeFile(path.join(privateSkillDir, "SKILL.md"), "# Private\n", "utf8");
    await writeFile(path.join(worldSkillDir, "SKILL.md"), "# World\n", "utf8");

    const tools = buildRealmAgentTools(
      sessionInput({
        allowedSkills: [
          {
            id: "role-private:note-taker",
            name: "note-taker",
            scope: "role-private",
            path: privateSkillDir,
          },
          {
            id: "world:note-taker",
            name: "note-taker",
            scope: "world",
            path: worldSkillDir,
          },
        ],
        allowedSkillPaths: [privateSkillDir, worldSkillDir],
      }),
    );
    const skillTool = tools.find((tool) => tool.name === "realm_skill_read");

    await expect(skillTool?.execute("tool-1", { name: "note-taker" })).rejects.toThrow(
      "Skill name is ambiguous",
    );
    const result = await skillTool?.execute("tool-1", { name: "world:note-taker" });
    expect(result?.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("# World"),
    });
  });

  test("rejects skill reads outside the allowed skill paths", async () => {
    const tools = buildRealmAgentTools(sessionInput({ allowedSkillPaths: ["/tmp/allowed"] }));
    const skillTool = tools.find((tool) => tool.name === "realm_skill_read");

    await expect(skillTool?.execute("tool-1", { name: "../secret" })).rejects.toThrow(
      "Skill is not available",
    );
  });
});

function sessionInput(
  input: Pick<PiSessionStartInput, "allowedSkillPaths" | "allowedSkills">,
): PiSessionStartInput {
  return {
    worldId: "cultivation",
    roomId: "main",
    roleId: "leijun",
    cwd: "/tmp/project",
    sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
    systemPrompt: "You are Lei Jun.",
    allowedSkills: input.allowedSkills,
    allowedSkillPaths: input.allowedSkillPaths,
    extensionPaths: [],
  };
}
