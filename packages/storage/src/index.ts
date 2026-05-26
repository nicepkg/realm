import { Database } from "bun:sqlite";
import type { RealmEvent } from "@realm/core";
import { realmEventSchema } from "@realm/core";

export type EventAppendInput = Record<string, unknown> & { seq?: never };

export type EventListOptions = {
  afterSeq?: number;
  limit?: number;
};

export interface EventStore {
  append(event: EventAppendInput): RealmEvent;
  list(options?: EventListOptions): readonly RealmEvent[];
  findByIdempotencyKey(idempotencyKey: string): RealmEvent | undefined;
  lastSeq(): number;
}

export class InMemoryEventStore implements EventStore {
  private readonly events: RealmEvent[] = [];

  append(input: EventAppendInput): RealmEvent {
    if (typeof input.idempotencyKey === "string") {
      const existing = this.events.find((event) => event.idempotencyKey === input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const event = realmEventSchema.parse({
      ...input,
      seq: this.events.length + 1,
    });
    this.events.push(event);
    return event;
  }

  list(options: EventListOptions = {}): readonly RealmEvent[] {
    const afterSeq = options.afterSeq ?? 0;
    const filtered = this.events.filter((event) => event.seq > afterSeq);
    return typeof options.limit === "number" ? filtered.slice(0, options.limit) : filtered;
  }

  findByIdempotencyKey(idempotencyKey: string): RealmEvent | undefined {
    return this.events.find((event) => event.idempotencyKey === idempotencyKey);
  }

  lastSeq(): number {
    return this.events.length;
  }
}

export class SQLiteEventStore implements EventStore {
  private readonly database: Database;
  private readonly defaultListLimit: number;

  constructor(filePath: string, options: { defaultListLimit?: number } = {}) {
    this.defaultListLimit = options.defaultListLimit ?? 500;
    this.database = new Database(filePath);
    this.database.exec(`
      create table if not exists events (
        seq integer primary key autoincrement,
        event_id text not null unique,
        schema_version integer not null,
        aggregate_id text not null,
        idempotency_key text unique,
        event_type text not null,
        created_at text not null,
        payload text not null
      );
      create index if not exists events_aggregate_idx on events (aggregate_id, seq);
      create index if not exists events_type_idx on events (event_type, seq);
    `);
  }

  append(input: EventAppendInput): RealmEvent {
    if (typeof input.idempotencyKey === "string") {
      const existing = this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const nextSeq = this.lastSeq() + 1;
    const event = realmEventSchema.parse({ ...input, seq: nextSeq });
    const insert = this.database.prepare(`
      insert into events (
        seq,
        event_id,
        schema_version,
        aggregate_id,
        idempotency_key,
        event_type,
        created_at,
        payload
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      event.seq,
      event.eventId,
      event.schemaVersion,
      event.aggregateId,
      event.idempotencyKey ?? null,
      event.type,
      event.createdAt,
      JSON.stringify(event),
    );

    return event;
  }

  list(options: EventListOptions = {}): readonly RealmEvent[] {
    const afterSeq = options.afterSeq ?? 0;
    const limit = options.limit ?? this.defaultListLimit;
    const rows = this.database
      .query<{ payload: string }, [number, number]>(
        "select payload from events where seq > ? order by seq asc limit ?",
      )
      .all(afterSeq, limit);
    return rows.map((row) => realmEventSchema.parse(JSON.parse(row.payload)));
  }

  lastSeq(): number {
    const row = this.database
      .query<{ seq: number | null }, []>("select max(seq) as seq from events")
      .get();
    return row?.seq ?? 0;
  }

  close(): void {
    this.database.close();
  }

  findByIdempotencyKey(idempotencyKey: string): RealmEvent | undefined {
    const row = this.database
      .query<{ payload: string }, [string]>(
        "select payload from events where idempotency_key = ? limit 1",
      )
      .get(idempotencyKey);

    return row ? realmEventSchema.parse(JSON.parse(row.payload)) : undefined;
  }
}
