import { stores, requireAuth, ok, err, corsHeaders } from './_utils.mjs';

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let caller;
  try { caller = await requireAuth(req); } catch (e) { return err(e.message, 401); }

  const { userId } = caller;
  const store = stores.notifications();
  const key = `notifs:${userId}`;

  if (req.method === 'GET') {
    const notifs = await store.get(key, { type: 'json' }) || [];
    return ok({ notifications: notifs });
  }

  if (req.method === 'PUT') {
    const notifs = await store.get(key, { type: 'json' }) || [];
    const updated = notifs.map(n => ({ ...n, read: true }));
    await store.set(key, JSON.stringify(updated));
    return ok({ updated: true });
  }

  return err('Not found', 404);
};

export const config = { path: '/api/notifications' };
