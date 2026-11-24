/**
 * Runs `fn` over `items`, `limit` at a time (enough to be quick, few enough
 * not to hit the gateway's rate limit). Never rejects: returns how many failed.
 * `onDone` is called after each item with the number finished so far.
 */
export const eachLimited = async <T>(items: T[], fn: (x: T, index: number) => Promise<unknown>, onDone?: (n: number) => void, limit = 4): Promise<number> => {
  let next = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i).catch(() => {
        failed += 1;
      });
      onDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return failed;
};

/**
 * A limit shared by every caller: at most `max` of the wrapped calls run at
 * once, the rest wait their turn (a slot passes straight to the next waiter).
 */
export const createLimiter = (max = 4) => {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < max) active += 1;
    else await new Promise<void>((resolve) => queue.push(resolve));
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active -= 1;
    }
  };
};
