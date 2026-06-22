/** Buckets timestamps into 24 hourly counts, oldest (23h ago) first, newest (this hour) last. */
export function bucketCountsByHour(timestamps: string[]): number[] {
  const buckets = new Array<number>(24).fill(0);
  const now = Date.now();

  for (const timestamp of timestamps) {
    const ageMs = now - new Date(timestamp).getTime();
    const hoursAgo = Math.floor(ageMs / (60 * 60 * 1000));
    if (hoursAgo >= 0 && hoursAgo < 24) {
      buckets[23 - hoursAgo] += 1;
    }
  }

  return buckets;
}

/** Buckets rows into 24 hourly counts of distinct `key` values, oldest first. */
export function bucketDistinctByHour(rows: Array<{ createdAt: string; key: string }>): number[] {
  const hourSets = Array.from({ length: 24 }, () => new Set<string>());
  const now = Date.now();

  for (const row of rows) {
    const ageMs = now - new Date(row.createdAt).getTime();
    const hoursAgo = Math.floor(ageMs / (60 * 60 * 1000));
    if (hoursAgo >= 0 && hoursAgo < 24) {
      hourSets[23 - hoursAgo].add(row.key);
    }
  }

  return hourSets.map((set) => set.size);
}
