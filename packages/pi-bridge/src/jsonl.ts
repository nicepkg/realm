import { z } from "zod";

export const piRpcRecordSchema = z
  .object({
    type: z.string().min(1),
  })
  .passthrough();

export type PiRpcRecord = z.infer<typeof piRpcRecordSchema>;

export function parsePiRpcJsonLine(line: string): PiRpcRecord {
  return piRpcRecordSchema.parse(JSON.parse(line.endsWith("\r") ? line.slice(0, -1) : line));
}

export function serializeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export class JsonlDecoder {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];

    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index === -1) {
        return lines;
      }
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (line.length > 0) {
        lines.push(line.endsWith("\r") ? line.slice(0, -1) : line);
      }
    }
  }

  flush(): string[] {
    if (this.buffer.length === 0) {
      return [];
    }
    const line = this.buffer;
    this.buffer = "";
    return [line.endsWith("\r") ? line.slice(0, -1) : line];
  }
}
