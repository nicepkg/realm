import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML, { isMap, isScalar, type YAMLMap } from "yaml";

type PlainRecord = Record<string, unknown>;
type ParsedYamlDocument = ReturnType<typeof YAML.parseDocument>;

export async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const raw = (await exists(filePath)) ? await readFile(filePath, "utf8") : undefined;
  const content = raw
    ? stringifyYamlPreservingComments(raw, value)
    : withFinalNewline(YAML.stringify(value));
  await writeFile(filePath, content, "utf8");
}

export function stringifyYamlPreservingComments(raw: string, value: unknown): string {
  const document = YAML.parseDocument(raw);
  if (isPlainRecord(value) && isMap(document.contents)) {
    syncMap(document, document.contents, [], value);
  } else {
    document.contents = document.createNode(value) as typeof document.contents;
  }
  return withFinalNewline(document.toString());
}

function syncMap(
  document: ParsedYamlDocument,
  yamlMap: YAMLMap<unknown, unknown>,
  basePath: string[],
  value: PlainRecord,
): void {
  const nextKeys = new Set(Object.keys(value));
  for (const key of existingKeys(yamlMap)) {
    if (!nextKeys.has(key)) {
      document.deleteIn([...basePath, key]);
    }
  }

  for (const [key, nextValue] of Object.entries(value)) {
    const nextPath = [...basePath, key];
    const currentValue = document.getIn(nextPath, true);
    if (isPlainRecord(nextValue) && isMap(currentValue)) {
      syncMap(document, currentValue, nextPath, nextValue);
    } else {
      document.setIn(nextPath, nextValue);
    }
  }
}

function existingKeys(yamlMap: YAMLMap<unknown, unknown>): string[] {
  return yamlMap.items
    .map((item) => {
      if (isScalar(item.key) && typeof item.key.value === "string") {
        return item.key.value;
      }
      return undefined;
    })
    .filter((key): key is string => Boolean(key));
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withFinalNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
