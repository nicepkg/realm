import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { connectEventFeed, type EventFeedStatus } from "./event-feed.ts";

/**
 * Minimal EventSource stub so the self-healing/reporting logic can be exercised
 * in the headless bun test runtime (no DOM). Each instance records itself so a
 * test can drive `onopen` / `onerror` and assert the honest status transitions.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

const realWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as { window: unknown }).window = {
    EventSource: FakeEventSource,
  };
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = realWindow;
  (globalThis as { EventSource?: unknown }).EventSource = undefined;
});

describe("connectEventFeed status reporting", () => {
  test("reports 'open' when the stream connects", () => {
    const statuses: EventFeedStatus[] = [];
    const dispose = connectEventFeed(
      () => {},
      0,
      (status) => statuses.push(status),
    );

    const source = FakeEventSource.instances.at(-1);
    source?.onopen?.();

    expect(statuses).toEqual(["open"]);
    dispose();
  });

  test("reports 'reconnecting' on error, then 'open' again after backoff recovery", async () => {
    const statuses: EventFeedStatus[] = [];
    const dispose = connectEventFeed(
      () => {},
      0,
      (status) => statuses.push(status),
    );

    const first = FakeEventSource.instances.at(-1);
    first?.onopen?.();
    expect(statuses).toEqual(["open"]);

    // Drop the connection: it must close the source and report reconnecting.
    first?.onerror?.();
    expect(first?.closed).toBe(true);
    expect(statuses).toEqual(["open", "reconnecting"]);

    // After the backoff timer fires a new EventSource opens; its onopen reports open.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const second = FakeEventSource.instances.at(-1);
    expect(second).not.toBe(first);
    second?.onopen?.();
    expect(statuses).toEqual(["open", "reconnecting", "open"]);

    dispose();
  });

  test("advances lastSeq and forwards seqs to onEvent", () => {
    const seqs: Array<number | undefined> = [];
    const dispose = connectEventFeed((seq) => seqs.push(seq), 3);

    const source = FakeEventSource.instances.at(-1);
    expect(source?.url).toContain("afterSeq=3");
    source?.onmessage?.({ data: JSON.stringify({ seq: 5 }) });
    expect(seqs).toEqual([5]);

    // A reconnect resumes from the last seen seq, not the initial afterSeq.
    source?.onerror?.();
    dispose();
  });

  test("is a no-op (and never throws) when EventSource is unavailable", () => {
    (globalThis as { window: unknown }).window = {};
    const statuses: EventFeedStatus[] = [];
    const dispose = connectEventFeed(
      () => {},
      0,
      (status) => statuses.push(status),
    );
    expect(statuses).toEqual([]);
    expect(() => dispose()).not.toThrow();
  });
});
