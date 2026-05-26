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

export function connectEventFeed(onEvent: () => void): () => void {
  if ("WebSocket" in window) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/events/ws`);
    let fallback: EventSource | undefined;
    let disposed = false;
    socket.onmessage = onEvent;
    socket.onerror = () => {
      if (disposed) {
        return;
      }
      socket.close();
      fallback = connectServerSentEvents(onEvent);
    };
    return () => {
      disposed = true;
      socket.onmessage = null;
      socket.onerror = null;
      socket.close();
      fallback?.close();
    };
  }

  const source = connectServerSentEvents(onEvent);
  return () => source.close();
}

function connectServerSentEvents(onEvent: () => void): EventSource {
  const source = new EventSource("/api/events/stream");
  source.onmessage = onEvent;
  source.onerror = () => {
    source.close();
  };
  return source;
}
