export function parsePatchValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function parseMemberIds(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).filter(Boolean))];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function connectEventFeed(onEvent: (seq?: number) => void, afterSeq = 0): () => void {
  if ("WebSocket" in window) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/events/ws?afterSeq=${afterSeq}`,
    );
    let fallback: EventSource | undefined;
    let disposed = false;
    socket.onmessage = (event) => onEvent(readEventSeq(event.data));
    socket.onerror = () => {
      if (disposed) {
        return;
      }
      socket.close();
      fallback = connectServerSentEvents(onEvent, afterSeq);
    };
    return () => {
      disposed = true;
      socket.onmessage = null;
      socket.onerror = null;
      socket.close();
      fallback?.close();
    };
  }

  const source = connectServerSentEvents(onEvent, afterSeq);
  return () => source.close();
}

function connectServerSentEvents(onEvent: (seq?: number) => void, afterSeq: number): EventSource {
  const source = new EventSource(`/api/events/stream?afterSeq=${afterSeq}`);
  source.onmessage = (event) => onEvent(readEventSeq(event.data));
  source.onerror = () => {
    source.close();
  };
  return source;
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
