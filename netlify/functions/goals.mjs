import { stores, requireAuth, ok, err, uid, addNotification, corsHeaders, currentPeriodStart, periodDates } from './_utils.mjs';

async function getAcceptedFriendships(userId) {
  const fStore = stores.friendships();
  const index = await fStore.get(`user_friendships:${userId}`, { type: 'json' }) || [];
  if (!index.length) return [];
  const recs = await Promise.all(index.map(id => fStore.get(`friendship:${id}`, { type: 'json' })));
  return recs.filter(f => f && f.status === 'accepted');
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let caller;
  try { caller = await requireAuth(req); } catch (e) { return err(e.message, 401); }

  const { userId, username } = caller;
  const id = context.params.id;
  const action = context.params.action;
  const method = req.method;
  const gStore = stores.goals();
  const userStore = stores.users();

  // GET /api/goals — list all goals per friendship
  if (method === 'GET' && !id) {
    const friendships = await getAcceptedFriendships(userId);
    const result = await Promise.all(friendships.map(async f => {
      const otherId = f.requesterId === userId ? f.receiverId : f.requesterId;
      const otherUser = await userStore.get(`user:${otherId}`, { type: 'json' });

      // Active goal
      const active = await gStore.get(`active_goal:${f.id}`, { type: 'json' });

      // Pending proposals for this friendship involving caller
      const allGoalIds = await gStore.get(`friendship_goals:${f.id}`, { type: 'json' }) || [];
      const goals = (await Promise.all(allGoalIds.map(gid => gStore.get(`goal:${gid}`, { type: 'json' })))).filter(Boolean);
      const pending = goals.filter(g => g.status === 'pending');

      return {
        friendshipId: f.id,
        friend: otherUser ? { id: otherId, username: otherUser.username } : null,
        activeGoal: active,
        pendingProposals: pending,
      };
    }));
    return ok({ goals: result });
  }

  // POST /api/goals — propose goal
  if (method === 'POST' && !id) {
    const { friendshipId, targetPoints, period } = await req.json();
    if (!friendshipId || !targetPoints || !period) return err('friendshipId, targetPoints, period required');
    if (!['1w', '2w', '3w', '1m'].includes(period)) return err('Period must be 1w, 2w, 3w, or 1m');
    if (targetPoints < 1 || targetPoints > 100000) return err('Invalid target points');

    const fStore = stores.friendships();
    const friendship = await fStore.get(`friendship:${friendshipId}`, { type: 'json' });
    if (!friendship || friendship.status !== 'accepted') return err('Friendship not found');
    if (friendship.requesterId !== userId && friendship.receiverId !== userId) return err('Forbidden', 403);

    const otherId = friendship.requesterId === userId ? friendship.receiverId : friendship.requesterId;
    const goalId = uid();
    const goal = {
      id: goalId,
      friendshipId,
      proposerId: userId,
      targetPoints: parseInt(targetPoints),
      period,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await gStore.set(`goal:${goalId}`, JSON.stringify(goal));

    const gIds = await gStore.get(`friendship_goals:${friendshipId}`, { type: 'json' }) || [];
    await gStore.set(`friendship_goals:${friendshipId}`, JSON.stringify([...gIds, goalId]));

    const otherUser = await stores.users().get(`user:${otherId}`, { type: 'json' });
    await addNotification(otherId, 'goal_proposal', {
      goalId,
      friendshipId,
      fromUsername: username,
      targetPoints,
      period,
    });
    return ok({ goal }, 201);
  }

  // PUT /api/goals/:id/respond
  if (method === 'PUT' && id && action === 'respond') {
    const goal = await gStore.get(`goal:${id}`, { type: 'json' });
    if (!goal) return err('Not found', 404);

    const fStore = stores.friendships();
    const friendship = await fStore.get(`friendship:${goal.friendshipId}`, { type: 'json' });
    const otherId = friendship.requesterId === userId ? friendship.receiverId : friendship.requesterId;
    if (friendship.requesterId !== userId && friendship.receiverId !== userId) return err('Forbidden', 403);
    if (goal.proposerId === userId) return err('Cannot respond to your own proposal');
    if (goal.status !== 'pending') return err('Already responded');

    const { accept } = await req.json();
    goal.status = accept ? 'accepted' : 'rejected';
    goal.updatedAt = new Date().toISOString();
    await gStore.set(`goal:${id}`, JSON.stringify(goal));

    if (accept) {
      const active = {
        goalId: id,
        targetPoints: goal.targetPoints,
        period: goal.period,
        activatedAt: new Date().toISOString(),
      };
      await gStore.set(`active_goal:${goal.friendshipId}`, JSON.stringify(active));
    }

    await addNotification(goal.proposerId, 'goal_response', {
      goalId: id,
      fromUsername: username,
      accepted: accept,
      targetPoints: goal.targetPoints,
      period: goal.period,
    });
    return ok({ goal });
  }

  return err('Not found', 404);
};

export const config = {
  path: ['/api/goals', '/api/goals/:id/:action'],
};
