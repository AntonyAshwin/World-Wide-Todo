/**
 * In-memory Netlify Blobs store mock.
 * Pass initial data as { 'key': value } — values are auto-serialised to JSON.
 */
export function createStore(initial = {}) {
  const data = new Map(
    Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)])
  );
  return {
    async get(key, opts) {
      const raw = data.get(key) ?? null;
      if (raw === null) return null;
      return opts?.type === 'json' ? JSON.parse(raw) : raw;
    },
    async set(key, value) {
      data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async delete(key) { data.delete(key); },
    async list({ prefix = '' } = {}) {
      const blobs = [];
      for (const key of data.keys()) {
        if (key.startsWith(prefix)) blobs.push({ key });
      }
      return { blobs };
    },
    // Sync helper for assertions in tests
    peek(key) {
      const raw = data.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    has(key) { return data.has(key); },
  };
}
