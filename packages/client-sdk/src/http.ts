import type { z } from "zod";

export type RealmClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export class RealmHttpTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RealmClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  protected async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);
    return this.parseResponse(response, schema);
  }

  protected async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.parseResponse(response, schema);
  }

  private async parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    const payload = await response.json();
    if (!response.ok) {
      const message =
        typeof payload?.error?.message === "string" ? payload.error.message : response.statusText;
      throw new Error(message);
    }
    return schema.parse(payload);
  }
}
