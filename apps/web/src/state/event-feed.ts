export function connectEventFeed(onEvent: (seq?: number) => void, afterSeq = 0): () => void {
  if ("EventSource" in window) {
    const source = connectServerSentEvents(onEvent, afterSeq);
    return () => source.close();
  }
  return () => {};
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
