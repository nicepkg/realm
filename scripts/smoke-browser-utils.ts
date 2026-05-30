import net from "node:net";
import os from "node:os";
import path from "node:path";

export function createAgentBrowserSmoke(session: string, outputDir: string) {
  const browser = (...args: string[]) => run(["agent-browser", ...args, "--session", session]);

  return {
    assertPage: async (label: string, expression: string) => {
      const result = await browserEval(browser, expression);
      if (!result.includes("true")) {
        throw new Error(`${label} failed. Result: ${result}`);
      }
    },
    browser,
    browserEval: (source: string) => browserEval(browser, source),
    clickInPage: (selector: string) => clickInPage(browser, selector),
    pageText: (selector: string) => pageText(browser, selector),
    screenshot: (fileName: string) => browser("screenshot", path.join(outputDir, fileName)),
    tryBrowser: async (...args: string[]) => {
      try {
        return await browser(...args);
      } catch {
        return undefined;
      }
    },
    waitForHttp,
    waitForPageExpression: (expression: string) => waitForPageExpression(browser, expression),
    waitForSelector: (selector: string) =>
      waitForPageExpression(
        browser,
        `document.querySelector(${JSON.stringify(selector)}) !== null`,
      ),
  };
}

export async function run(command: string[]): Promise<string> {
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

export async function ensureCommand(command: string): Promise<void> {
  const checker = os.platform() === "win32" ? "where" : "which";
  await run([checker, command]);
}

export async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port near ${start}`);
}

export async function drain(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (stream) await new Response(stream).text().catch(() => undefined);
}

export function readFlag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function browserEval(
  browser: (...args: string[]) => Promise<string>,
  source: string,
): Promise<string> {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return browser("eval", "-b", encoded);
}

async function clickInPage(
  browser: (...args: string[]) => Promise<string>,
  selector: string,
): Promise<void> {
  const source = `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Missing selector: ${selector}");
      if (element instanceof HTMLElement) element.focus();
      // Radix SelectItem commits its value only when a correlated pointerdown →
      // pointermove → pointerup sequence lands on the SAME item (it tracks the
      // pointerId and treats an uncorrelated tap as a no-op). Carry a stable
      // pointerId + isPrimary across the whole sequence so Select items, menu
      // items, dialog buttons, and plain controls all commit reliably under
      // automation — without this a Select silently keeps its previous value.
      const pointerOptions = {
        bubbles: true,
        button: 0,
        cancelable: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
      };
      const mouseOptions = { bubbles: true, button: 0, cancelable: true };
      element.dispatchEvent(new PointerEvent("pointerover", pointerOptions));
      element.dispatchEvent(new PointerEvent("pointerenter", pointerOptions));
      element.dispatchEvent(new PointerEvent("pointermove", pointerOptions));
      element.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
      element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));
      element.dispatchEvent(new PointerEvent("pointerup", pointerOptions));
      element.dispatchEvent(new MouseEvent("mouseup", mouseOptions));
      element.click();
      return true;
    })();
  `;
  await browserEval(browser, source);
}

async function pageText(
  browser: (...args: string[]) => Promise<string>,
  selector: string,
): Promise<string> {
  const result = await browserEval(
    browser,
    `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`,
  );
  return result.trim().replace(/^"|"$/g, "");
}

async function waitForPageExpression(
  browser: (...args: string[]) => Promise<string>,
  expression: string,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const result = await browserEval(browser, expression);
      if (result.includes("true")) {
        return;
      }
    } catch {
      // Browser automation can be briefly unavailable during reload.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for page expression: ${expression}`);
}

async function waitForHttp(target: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(target);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}
