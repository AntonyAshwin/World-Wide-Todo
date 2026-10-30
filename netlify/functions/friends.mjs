import { stores, requireAuth, ok, err, uid, addNotification, corsHeaders } from './_utils.mjs';

async function getUserFriendships(userId) {
  const store = stores.friendships();
  const index = await store.get(`user_friendships:${userId}`, { type: 'json' }) || [];
  if (!index.length) return [];
  const records = await Promise.all(index.map(id => store.get(`friendship:${id}`, { type: 'json' })));
  return records.filter(Boolean);
}

async function addToUserIndex(userId, friendshipId) {
  const store = stores.friendships();
  const key = `user_friendships:${userId}`;
  const existing = await store.get(key, { type: 'json' }) || [];
  if (!existing.includes(friendshipId)) {
    await store.set(key, JSON.stringify([...existing, friendshipId]));
  }
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let caller;
  try { caller = await requireAuth(req); } catch (e) { return err(e.message, 401); }

  const { userId } = caller;
  const id = context.params.id;
  const action = context.params.action;
  const method = req.method;
  const store = stores.friendships();
  const userStore = stores.users();

  // GET /api/friends — list
  if (method === 'GET' && !id) {
    const friendships = await getUserFriendships(userId);
    const enriched = await Promise.all(friendships.map(async f => {
      const otherId = f.requesterId === userId ? f.receiverId : f.requesterId;
      const other = await userStore.get(`user:${otherId}`, { type: 'json' });
      return { ...f, otherUser: other ? { id: otherId, username: other.username } : null };
    }));
    return ok({ friendships: enriched });
  }

  // POST /api/friends/request
  if (method === 'POST' && !id) {
    const { username } = await req.json();
    if (!username) return err('Username required');

    const lookup = await userStore.get(`username:${username.toLowerCase()}`, { type: 'json' });
    if (!lookup) return err('User not found', 404);
    if (lookup.userId === userId) return err('Cannot add yourself');

    const receiverId = lookup.userId;
    const friendships = await getUserFriendships(userId);
    const alreadyExists = friendships.find(f =>
      (f.requesterId === userId && f.receiverId === receiverId) ||
      (f.requesterId === receiverId && f.receiverId === userId)
    );
    if (alreadyExists) return err('Friend request already exists', 409);

    const fid = uid();
    const friendship = {
      id: fid,
      requesterId: userId,
      receiverId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.set(`friendship:${fid}`, JSON.stringify(friendship));
    await Promise.all([addToUserIndex(userId, fid), addToUserIndex(receiverId, fid)]);
    await addNotification(receiverId, 'friend_request', { friendshipId: fid, fromUsername: caller.username });

    return ok({ friendship }, 201);
  }

  // PUT /api/friends/:id/respond
  if (method === 'PUT' && id && action === 'respond') {
    const { accept } = await req.json();
    const friendship = await store.get(`friendship:${id}`, { type: 'json' });
    if (!friendship) return err('Not found', 404);
    if (friendship.receiverId !== userId) return err('Forbidden', 403);
    if (friendship.status !== 'pending') return err('Already responded', 409);

    friendship.status = accept ? 'accepted' : 'rejected';
    friendship.updatedAt = new Date().toISOString();
    await store.set(`friendship:${id}`, JSON.stringify(friendship));

    await addNotification(friendship.requesterId, 'friend_response', {
      friendshipId: id,
      fromUsername: caller.username,
      accepted: accept,
    });

    return ok({ friendship });
  }

  return err('Not found', 404);
};

export const config = {
  path: ['/api/friends', '/api/friends/:id/:action'],
};
