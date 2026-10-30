import { stores, requireAuth, ok, err, corsHeaders } from './_utils.mjs';

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let caller;
  try { caller = await requireAuth(req); } catch (e) { return err(e.message, 401); }

  const { userId } = caller;
  const store = stores.notifications();

  if (req.method === 'GET') {
    const { blobs } = await store.list({ prefix: `notif:${userId}:` });
    if (!blobs.length) return ok({ notifications: [] });
    const notifs = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }))))
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);
    return ok({ notifications: notifs });
  }

  if (req.method === 'PUT') {
    const { blobs } = await store.list({ prefix: `notif:${userId}:` });
    await Promise.all(blobs.map(async b => {
      const n = await store.get(b.key, { type: 'json' });
      if (n && !n.read) await store.set(b.key, JSON.stringify({ ...n, read: true }));
    }));
    return ok({ updated: true });
  }

  return err('Not found', 404);
};

export const config = { path: '/api/notifications' };
