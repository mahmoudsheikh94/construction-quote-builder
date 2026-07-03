export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Run fn over items with at most `limit` concurrent executions, preserving
// input order in the returned array. A worker pulls the next index until the
// queue drains. If any fn rejects, the returned promise rejects.
export async function mapLimit<T, R>(
  items: T[], limit: number, fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const n = Math.min(limit, items.length); // 0 workers for empty input; caps at item count
  for (let w = 0; w < n; w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}
