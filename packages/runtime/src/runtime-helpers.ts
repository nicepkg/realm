export class TurnCancelledError extends Error {
  constructor(turnId: string) {
    super(`Turn cancelled: ${turnId}`);
    this.name = "TurnCancelledError";
  }
}

export function fakeClock(start: Date): {
  next: () => Date;
  current: () => Date;
  peek: (offsetMs: number) => Date;
} {
  let current = start.getTime();
  return {
    next: () => {
      current += 1000;
      return new Date(current);
    },
    current: () => new Date(current),
    peek: (offsetMs: number) => new Date(current + offsetMs),
  };
}

export async function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  const timeout = new Promise<IteratorResult<T>>((resolve) => {
    setTimeout(() => resolve({ done: true, value: undefined }), timeoutMs);
  });
  const result = await Promise.race([iterator.next(), timeout]);
  return result.done ? undefined : result.value;
}
