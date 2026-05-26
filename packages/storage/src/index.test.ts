import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { InMemoryEventStore, SQLiteEventStore } from "./index.ts";

const firstEvent = {
  eventId: "event:1",
  schemaVersion: 1,
  aggregateId: "project:demo",
  idempotencyKey: "config-reload-1",
  createdAt: "2026-05-26T00:00:00.000Z",
  type: "config.reloaded",
  projectId: "project:demo",
} as const;

const secondEvent = {
  eventId: "event:2",
  schemaVersion: 1,
  aggregateId: "project:demo",
  createdAt: "2026-05-26T00:00:01.000Z",
  type: "config.reloaded",
  projectId: "project:demo",
} as const;

describe("event stores", () => {
  test("assigns monotonic sequence", () => {
    const store = new InMemoryEventStore();

    store.append(firstEvent);
    store.append(secondEvent);

    expect(store.list().map((event) => event.seq)).toEqual([1, 2]);
  });

  test("deduplicates in-memory events by idempotency key", () => {
    const store = new InMemoryEventStore();
    const first = store.append(firstEvent);
    const duplicate = store.append({ ...firstEvent, eventId: "event:duplicate" });

    expect(duplicate.eventId).toBe(first.eventId);
    expect(store.list()).toHaveLength(1);
  });

  test("persists SQLite events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-sqlite-events-"));
    const store = new SQLiteEventStore(path.join(root, "events.sqlite"));
    store.append(firstEvent);
    store.append(secondEvent);
    store.close();

    const reopened = new SQLiteEventStore(path.join(root, "events.sqlite"));
    expect(reopened.list().map((event) => event.seq)).toEqual([1, 2]);
    reopened.close();
  });

  test("deduplicates SQLite events by idempotency key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-sqlite-idempotency-"));
    const store = new SQLiteEventStore(path.join(root, "events.sqlite"));
    const first = store.append(firstEvent);
    const duplicate = store.append({ ...firstEvent, eventId: "event:duplicate" });

    expect(duplicate.eventId).toBe(first.eventId);
    expect(store.findByIdempotencyKey("config-reload-1")?.eventId).toBe(first.eventId);
    expect(store.list()).toHaveLength(1);
    store.close();
  });

  test("lists events after a sequence cursor", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-sqlite-cursor-"));
    const store = new SQLiteEventStore(path.join(root, "events.sqlite"));
    store.append(firstEvent);
    store.append(secondEvent);

    expect(store.list({ afterSeq: 1 }).map((event) => event.eventId)).toEqual(["event:2"]);
    store.close();
  });
});
