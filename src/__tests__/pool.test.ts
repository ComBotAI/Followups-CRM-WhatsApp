import { createLimiter } from '@/lib/pool';

describe('createLimiter', () => {
  it('never runs more than its limit at once, across callers, and runs every call', async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    const task = (i: number) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, (i % 4) * 2));
        active -= 1;
        return i;
      });
    // Two "callers" starting at once, plus a late one.
    const a = Promise.all(Array.from({ length: 10 }, (_, i) => task(i)));
    const b = Promise.all(Array.from({ length: 10 }, (_, i) => task(i + 10)));
    await new Promise((r) => setTimeout(r, 1));
    const c = task(99);
    expect(await a).toEqual(Array.from({ length: 10 }, (_, i) => i));
    expect(await b).toHaveLength(10);
    expect(await c).toBe(99);
    expect(peak).toBe(3);
  });

  it('frees the slot when a call fails', async () => {
    const limit = createLimiter(1);
    await expect(limit(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });
});
