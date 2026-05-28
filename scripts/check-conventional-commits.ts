import { readFile } from "node:fs/promises";

const conventionalCommitPattern =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+$/;
const mergeCommitPattern = /^(Merge|Auto-merge|Revert ")/;

const subjects = await collectCommitSubjects();
const checked = subjects.filter((subject) => subject.trim().length > 0);
const failures = checked.filter((subject) => !isAllowedSubject(subject));

if (failures.length > 0) {
  console.error("Conventional commit check failed:");
  for (const subject of failures) {
    console.error(`  ${subject}`);
  }
  console.error(
    "\nExpected examples: feat(web): add room avatars, fix(tui): preserve drafts, docs: update install guide.",
  );
  process.exit(1);
}

console.log(`Conventional commit check passed for ${checked.length} commit(s).`);

function isAllowedSubject(subject: string): boolean {
  return conventionalCommitPattern.test(subject) || mergeCommitPattern.test(subject);
}

async function collectCommitSubjects(): Promise<string[]> {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === "pull_request") {
    return collectPullRequestSubjects();
  }
  if (eventName === "push") {
    return collectPushSubjects();
  }
  return gitLogSubjects("-1");
}

async function collectPullRequestSubjects(): Promise<string[]> {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (!baseRef) {
    return gitLogSubjects("-1");
  }
  await run(["git", "fetch", "origin", baseRef, "--depth=100"]).catch(() => undefined);
  const mergeBase = await run(["git", "merge-base", "HEAD", `origin/${baseRef}`]).catch(
    () => undefined,
  );
  return mergeBase ? gitLogSubjects(`${mergeBase.trim()}..HEAD`) : gitLogSubjects("-1");
}

async function collectPushSubjects(): Promise<string[]> {
  const event = await readGitHubEvent();
  const messages = event?.commits?.map((commit) => firstLine(commit.message)).filter(Boolean);
  if (messages && messages.length > 0) {
    return messages;
  }

  const before = event?.before;
  const after = event?.after ?? "HEAD";
  if (before && !/^0+$/.test(before)) {
    return gitLogSubjects(`${before}..${after}`);
  }
  return gitLogSubjects("-1");
}

async function readGitHubEvent(): Promise<
  | {
      after?: string;
      before?: string;
      commits?: Array<{ message: string }>;
    }
  | undefined
> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }
  try {
    return JSON.parse(await readFile(eventPath, "utf8"));
  } catch {
    return undefined;
  }
}

async function gitLogSubjects(range: string): Promise<string[]> {
  const output = await run(["git", "log", "--format=%s", range]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0]?.trim() ?? "";
}

async function run(command: string[]): Promise<string> {
  const proc = Bun.spawn(command, { stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${stderr || stdout}`);
  }
  return stdout.trim();
}
