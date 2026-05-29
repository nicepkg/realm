const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10_000;

/** Honest connection state surfaced to the UI: live stream vs. recovering. */
export type EventFeedStatus = "open" | "reconnecting";

/**
 * Connect to the realm event stream and invoke `onEvent` for each event seq.
 * The connection self-heals: on error the EventSource is torn down and a new
 * one is opened from the last seen seq with exponential backoff, so a dropped
 * SSE connection (idle timeout, proxy reset, sleep/wake) silently recovers
 * instead of freezing the UI. `onStatus` (optional) reports honest connection
 * transitions so the UI can show a calm "reconnecting" affordance instead of
 * silently freezing — `"open"` on connect, `"reconnecting"` on drop/backoff.
 * Returns a disposer that stops reconnecting.
 */
export function connectEventFeed(
  onEvent: (seq?: number) => void,
  afterSeq = 0,
  onStatus?: (status: EventFeedStatus) => void,
): () => void {
  if (!("EventSource" in window)) {
    return () => {};
  }

  let source: EventSource | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  let lastSeq = afterSeq;
  let disposed = false;

  const open = () => {
    if (disposed) {
      return;
    }
    const current = new EventSource(`/api/events/stream?afterSeq=${lastSeq}`);
    source = current;
    current.onopen = () => {
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      onStatus?.("open");
    };
    current.onmessage = (event) => {
      const seq = readEventSeq(event.data);
      if (typeof seq === "number") {
        lastSeq = seq;
      }
      onEvent(seq);
    };
    current.onerror = () => {
      current.close();
      if (source === current) {
        source = undefined;
      }
      onStatus?.("reconnecting");
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      open();
    }, reconnectDelay);
  };

  open();

  return () => {
    disposed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    source?.close();
    source = undefined;
  };
}

function readEventSeq(data: unknown): number | undefined {
  if (typeof data !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(data) as { seq?: unknown };
    return typeof parsed.seq === "number" ? parsed.seq : undefined;
  } catch {
    return undefined;
  }
}
