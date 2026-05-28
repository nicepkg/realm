import { describe, expect, test } from "bun:test";
import { parseTuiOptions } from "./tui-options.ts";

describe("TUI options", () => {
  test("parses locale and draft directory flags", () => {
    expect(
      parseTuiOptions([
        "--base-url",
        "http://127.0.0.1:3737",
        "--locale",
        "zh-CN",
        "--drafts-dir",
        "/tmp/realm-drafts",
      ]),
    ).toMatchObject({
      baseUrl: "http://127.0.0.1:3737",
      draftsDir: "/tmp/realm-drafts",
      locale: "zh-CN",
    });
  });
});
