import { stores, requireAuth, ok, err, corsHeaders, currentPeriodStart, periodDates } from './_utils.mjs';

async function sumPoints(userId, dates) {
  const pStore = stores.points();
  const totals = await Promise.all(dates.map(d => pStore.get(`daily:${userId}:${d}`, { type: 'json' })));
  return totals.reduce((sum, rec) => sum + (rec ? rec.points : 0), 0);
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let caller;
  try { caller = await requireAuth(req); } catch (e) { return err(e.message, 401); }

  const { userId } = caller;
  const fStore = stores.friendships();
  const gStore = stores.goals();
  const userStore = stores.users();

  const index = await fStore.get(`user_friendships:${userId}`, { type: 'json' }) || [];
  const friendships = (await Promise.all(index.map(id => fStore.get(`friendship:${id}`, { type: 'json' }))))
    .filter(f => f && f.status === 'accepted');

  if (!friendships.length) return ok({ boards: [] });

  const boards = await Promise.all(friendships.map(async f => {
    const otherId = f.requesterId === userId ? f.receiverId : f.requesterId;
    const otherUser = await userStore.get(`user:${otherId}`, { type: 'json' });

    const active = await gStore.get(`active_goal:${f.id}`, { type: 'json' });
    if (!active) {
      return {
        friendshipId: f.id,
        friend: otherUser ? { id: otherId, username: otherUser.username } : { id: otherId, username: '?' },
        hasGoal: false,
      };
    }

    const startDate = currentPeriodStart(active.period, active.activatedAt);
    const dates = periodDates(active.period, startDate);

    const [myPoints, friendPoints] = await Promise.all([
      sumPoints(userId, dates),
      sumPoints(otherId, dates),
    ]);

    const target = active.targetPoints;
    return {
      friendshipId: f.id,
      friend: otherUser ? { id: otherId, username: otherUser.username } : { id: otherId, username: '?' },
      hasGoal: true,
      goal: { targetPoints: target, period: active.period, startDate, endDate: dates[dates.length - 1] },
      me: { points: myPoints, pct: Math.min(100, Math.round((myPoints / target) * 100)) },
      them: { points: friendPoints, pct: Math.min(100, Math.round((friendPoints / target) * 100)) },
    };
  }));

  return ok({ boards });
};

export const config = { path: '/api/scoreboard' };
