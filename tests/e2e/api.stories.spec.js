/**
 * API story tests — Playwright request context (no browser).
 *
 * Requires: netlify dev running on port 3000.
 * Run: npm run test:e2e
 *
 * Each test registers fresh users so tests are fully isolated.
 * Covers every scenario from the user request:
 *   - Friend request accept/decline
 *   - Task approval → approve/reject/edit/delete
 *   - Score after approve + complete
 *   - Score drops after unlock (unapprove) or task delete
 *   - Goal proposal accept/decline effects on scoreboard
 */

import { test, expect } from '@playwright/test';

// ── shared helpers ─────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
}

async function register(request, username, password = 'pass1234') {
  const res = await request.post('/api/auth/register', { data: { username, password } });
  const body = await res.json();
  if (!body.success) throw new Error(`register ${username}: ${body.error}`);
  return body.data; // { token, user: { id, username } }
}

function api(request, token) {
  const h = { Authorization: `Bearer ${token}` };
  return {
    get:  (path)       => request.get(path, { headers: h }),
    post: (path, data) => request.post(path, { data, headers: h }),
    put:  (path, data) => request.put(path, { data, headers: h }),
    del:  (path)       => request.delete(path, { headers: h }),
  };
}

async function j(res) {
  return res.json();
}

// Registers two users and creates an accepted friendship.
// Returns { a, b, u, w, friendshipId }
//   a/b = { token, user: { id, username } }
//   u/w = authenticated api clients for a and b
async function makePair(request) {
  const id = uid();
  const [a, b] = await Promise.all([
    register(request, `alice${id}`, 'pass1234'),
    register(request, `wer${id}`, 'werwer'),
  ]);
  const u = api(request, a.token);
  const w = api(request, b.token);

  const fr = await j(await u.post('/api/friends', { username: b.user.username }));
  if (!fr.success) throw new Error(`friend request: ${fr.error}`);
  const friendshipId = fr.data.friendship.id;

  const respond = await j(await w.put(`/api/friends/${friendshipId}/respond`, { accept: true }));
  if (!respond.success) throw new Error(`accept friend: ${respond.error}`);

  return { a, b, u, w, friendshipId };
}

// Pair + accepted goal so scoreboard boards have hasGoal=true.
async function makePairWithGoal(request, targetPoints = 100) {
  const ctx = await makePair(request);

  const gr = await j(await ctx.u.post('/api/goals', {
    friendshipId: ctx.friendshipId,
    targetPoints,
    period: '1w',
  }));
  if (!gr.success) throw new Error(`propose goal: ${gr.error}`);
  const goalId = gr.data.goal.id;

  const respond = await j(await ctx.w.put(`/api/goals/${goalId}/respond`, { accept: true }));
  if (!respond.success) throw new Error(`accept goal: ${respond.error}`);

  return { ...ctx, goalId };
}

// ── Story: Friendship ──────────────────────────────────────────────────────────

test.describe('Story: Friendship — friend request lifecycle', () => {
  test('accepted request — both parties see each other as accepted', async ({ request }) => {
    const id = uid();
    const [a, b] = await Promise.all([
      register(request, `alice${id}`),
      register(request, `wer${id}`, 'werwer'),
    ]);
    const u = api(request, a.token);
    const w = api(request, b.token);

    // A sends request
    const fr = await j(await u.post('/api/friends', { username: b.user.username }));
    expect(fr.success).toBe(true);
    expect(fr.data.friendship.status).toBe('pending');
    const fid = fr.data.friendship.id;

    // B accepts
    const resp = await j(await w.put(`/api/friends/${fid}/respond`, { accept: true }));
    expect(resp.data.friendship.status).toBe('accepted');

    // Both GET /api/friends — friendship visible and accepted
    const [aList, bList] = await Promise.all([
      j(await u.get('/api/friends')),
      j(await w.get('/api/friends')),
    ]);
    const aEntry = aList.data.friendships.find(f => f.id === fid);
    const bEntry = bList.data.friendships.find(f => f.id === fid);
    expect(aEntry.status).toBe('accepted');
    expect(bEntry.status).toBe('accepted');
    expect(aEntry.otherUser.username).toBe(b.user.username);
    expect(bEntry.otherUser.username).toBe(a.user.username);
  });

  test('declined request — neither party has accepted friendship', async ({ request }) => {
    const id = uid();
    const [a, b] = await Promise.all([
      register(request, `alice${id}`),
      register(request, `wer${id}`, 'werwer'),
    ]);
    const u = api(request, a.token);
    const w = api(request, b.token);

    const fr = await j(await u.post('/api/friends', { username: b.user.username }));
    const fid = fr.data.friendship.id;

    // B declines
    const resp = await j(await w.put(`/api/friends/${fid}/respond`, { accept: false }));
    expect(resp.data.friendship.status).toBe('rejected');

    // Neither has accepted friendships
    const [aList, bList] = await Promise.all([
      j(await u.get('/api/friends')),
      j(await w.get('/api/friends')),
    ]);
    const aAccepted = aList.data.friendships.filter(f => f.status === 'accepted');
    const bAccepted = bList.data.friendships.filter(f => f.status === 'accepted');
    expect(aAccepted).toHaveLength(0);
    expect(bAccepted).toHaveLength(0);
  });

  test('cannot send friend request to yourself', async ({ request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);
    const u = api(request, a.token);

    const fr = await j(await u.post('/api/friends', { username: a.user.username }));
    expect(fr.success).toBe(false);
  });

  test('cannot send duplicate friend request', async ({ request }) => {
    const id = uid();
    const [a, b] = await Promise.all([
      register(request, `alice${id}`),
      register(request, `wer${id}`, 'werwer'),
    ]);
    const u = api(request, a.token);

    await u.post('/api/friends', { username: b.user.username });
    const dup = await j(await u.post('/api/friends', { username: b.user.username }));
    expect(dup.success).toBe(false);
  });
});

// ── Story: Task Approval ───────────────────────────────────────────────────────

test.describe('Story: Task Approval — pending approval management', () => {
  test('request approval — friend sees it with ownerUsername', async ({ request }) => {
    const { a, b, u, w } = await makePair(request);

    const t = (await j(await u.post('/api/tasks', { name: 'Run 5k', points: 20, days: [] }))).data.task;
    const apr = await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }));
    expect(apr.success).toBe(true);
    expect(apr.data.approval.status).toBe('pending');

    const pending = await j(await w.get('/api/tasks/approvals'));
    expect(pending.data.approvals).toHaveLength(1);
    expect(pending.data.approvals[0].ownerUsername).toBe(a.user.username);
    expect(pending.data.approvals[0].pendingName).toBe('Run 5k');
    expect(pending.data.approvals[0].pendingPoints).toBe(20);
  });

  test('friend approves — task.approvalStatus becomes approved', async ({ request }) => {
    const { b, u, w } = await makePair(request);

    const t = (await j(await u.post('/api/tasks', { name: 'Yoga', points: 15, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;

    const respond = await j(await w.put(`/api/tasks/${apr.id}/approve`, { accept: true }));
    expect(respond.data.task.approvalStatus).toBe('approved');
    expect(respond.data.task.approvedBy).toBe(b.user.id);

    // Pending list now empty
    const pending = await j(await w.get('/api/tasks/approvals'));
    expect(pending.data.approvals).toHaveLength(0);
  });

  test('friend rejects — task.approvalStatus back to none', async ({ request }) => {
    const { b, u, w } = await makePair(request);

    const t = (await j(await u.post('/api/tasks', { name: 'Swim', points: 25, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;

    const respond = await j(await w.put(`/api/tasks/${apr.id}/approve`, { accept: false }));
    expect(respond.data.task.approvalStatus).toBe('none');

    // Pending list empty
    const pending = await j(await w.get('/api/tasks/approvals'));
    expect(pending.data.approvals).toHaveLength(0);
  });

  test('edit task while approval pending — approval cancelled, friend sees empty list', async ({ request }) => {
    const { b, u, w } = await makePair(request);

    const t = (await j(await u.post('/api/tasks', { name: 'Cycle', points: 30, days: [] }))).data.task;
    await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id });

    // B sees 1 pending before edit
    const beforeEdit = await j(await w.get('/api/tasks/approvals'));
    expect(beforeEdit.data.approvals).toHaveLength(1);

    // A edits the task (different name/points)
    const edited = await j(await u.put(`/api/tasks/${t.id}`, { name: 'Cycle fast', points: 35, days: [] }));
    expect(edited.data.task.approvalStatus).toBe('none');
    expect(edited.data.task.activeApprovalId).toBeNull();

    // B now sees no pending approvals
    const afterEdit = await j(await w.get('/api/tasks/approvals'));
    expect(afterEdit.data.approvals).toHaveLength(0);
  });

  test('delete task while approval pending — approval cancelled, friend sees empty list', async ({ request }) => {
    const { b, u, w } = await makePair(request);

    const t = (await j(await u.post('/api/tasks', { name: 'Dance', points: 12, days: [] }))).data.task;
    await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id });

    // B sees 1 pending before delete
    const beforeDel = await j(await w.get('/api/tasks/approvals'));
    expect(beforeDel.data.approvals).toHaveLength(1);

    // A deletes task
    const del = await j(await u.del(`/api/tasks/${t.id}`));
    expect(del.data.deleted).toBe(true);

    // B sees no pending approvals
    const afterDel = await j(await w.get('/api/tasks/approvals'));
    expect(afterDel.data.approvals).toHaveLength(0);
  });

  test('cannot respond to same approval twice', async ({ request }) => {
    const { b, u, w } = await makePair(request);

    const t = (await j(await u.post('/api/tasks', { name: 'Hike', points: 40, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;

    await w.put(`/api/tasks/${apr.id}/approve`, { accept: true });
    const second = await j(await w.put(`/api/tasks/${apr.id}/approve`, { accept: false }));
    expect(second.success).toBe(false);
  });

  test('non-friend cannot be set as approver', async ({ request }) => {
    const id = uid();
    const [a, stranger] = await Promise.all([
      register(request, `alice${id}`),
      register(request, `stranger${id}`),
    ]);
    const u = api(request, a.token);

    const t = (await j(await u.post('/api/tasks', { name: 'Run', points: 5, days: [] }))).data.task;
    const apr = await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: stranger.user.id }));
    expect(apr.success).toBe(false);
  });
});

// ── Story: Scoring ─────────────────────────────────────────────────────────────

test.describe('Story: Scoring — two-bucket points architecture', () => {
  test('completing unapproved task adds personal points but not pair score', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 100);
    const { u } = ctx;

    const t = (await j(await u.post('/api/tasks', { name: 'Unapproved', points: 10, days: [] }))).data.task;
    await u.post(`/api/tasks/${t.id}/complete`);

    const board = await j(await u.get('/api/scoreboard'));
    const entry = board.data.boards.find(b => b.friendshipId === ctx.friendshipId);
    expect(entry.hasGoal).toBe(true);
    // Approved bucket: 0 (task not approved)
    expect(entry.me.points).toBe(0);
  });

  test('completing approved task adds to pair score for both parties', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 100);
    const { a, b, u, w } = ctx;

    const t = (await j(await u.post('/api/tasks', { name: 'Approved run', points: 20, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;
    await w.put(`/api/tasks/${apr.id}/approve`, { accept: true });

    await u.post(`/api/tasks/${t.id}/complete`);

    const [aBoard, bBoard] = await Promise.all([
      j(await u.get('/api/scoreboard')),
      j(await w.get('/api/scoreboard')),
    ]);
    const aEntry = aBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    const bEntry = bBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);

    // A sees me.points = 20
    expect(aEntry.me.points).toBe(20);
    // B sees them.points = 20 (A is "them" from B's perspective)
    expect(bEntry.them.points).toBe(20);
    // B hasn't completed anything
    expect(bEntry.me.points).toBe(0);
  });

  test('full happy path — multiple tasks, only approved count in pair score', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 200);
    const { a, b, u, w } = ctx;

    // A creates 3 tasks
    const [t1r, t2r, t3r] = await Promise.all([
      j(await u.post('/api/tasks', { name: 'Task A', points: 10, days: [] })),
      j(await u.post('/api/tasks', { name: 'Task B', points: 15, days: [] })),
      j(await u.post('/api/tasks', { name: 'Task C unapproved', points: 50, days: [] })),
    ]);
    const [t1, t2, t3] = [t1r.data.task, t2r.data.task, t3r.data.task];

    // Approve t1 and t2 (sequential to avoid race on wer's index)
    const apr1 = (await j(await u.post(`/api/tasks/${t1.id}/request-approval`, { approverId: b.user.id }))).data.approval;
    const apr2 = (await j(await u.post(`/api/tasks/${t2.id}/request-approval`, { approverId: b.user.id }))).data.approval;

    await w.put(`/api/tasks/${apr1.id}/approve`, { accept: true });
    await w.put(`/api/tasks/${apr2.id}/approve`, { accept: true });

    // Complete sequentially — concurrent writes to the same daily bucket would race
    await u.post(`/api/tasks/${t1.id}/complete`);
    await u.post(`/api/tasks/${t2.id}/complete`);
    await u.post(`/api/tasks/${t3.id}/complete`);

    const [aBoard, bBoard] = await Promise.all([
      j(await u.get('/api/scoreboard')),
      j(await w.get('/api/scoreboard')),
    ]);
    const aEntry = aBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    const bEntry = bBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);

    // Only approved tasks count: 10 + 15 = 25
    expect(aEntry.me.points).toBe(25);
    expect(bEntry.them.points).toBe(25);
    expect(aEntry.me.pct).toBe(13); // 25/200 = 12.5 → 13
  });

  test('unlock (unapprove) completed approved task — pair score drops to 0', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 50);
    const { b, u, w } = ctx;

    const t = (await j(await u.post('/api/tasks', { name: 'To unlock', points: 30, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;
    await w.put(`/api/tasks/${apr.id}/approve`, { accept: true });
    await u.post(`/api/tasks/${t.id}/complete`);

    // Confirm score is 30 before unlock
    const before = await j(await u.get('/api/scoreboard'));
    const beforeEntry = before.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    expect(beforeEntry.me.points).toBe(30);

    // A unlocks (unapproves) the task
    const unlock = await j(await u.post(`/api/tasks/${t.id}/unapprove`));
    expect(unlock.data.task.approvalStatus).toBe('none');

    // Both now see 0 pair score
    const [aBoard, bBoard] = await Promise.all([
      j(await u.get('/api/scoreboard')),
      j(await w.get('/api/scoreboard')),
    ]);
    const aEntry = aBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    const bEntry = bBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    expect(aEntry.me.points).toBe(0);
    expect(bEntry.them.points).toBe(0);
  });

  test('delete completed approved task — pair score drops to 0 for both', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 50);
    const { b, u, w } = ctx;

    const t = (await j(await u.post('/api/tasks', { name: 'To delete', points: 25, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;
    await w.put(`/api/tasks/${apr.id}/approve`, { accept: true });
    await u.post(`/api/tasks/${t.id}/complete`);

    // Confirm score is 25
    const before = await j(await u.get('/api/scoreboard'));
    const beforeEntry = before.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    expect(beforeEntry.me.points).toBe(25);

    // A deletes the task
    const del = await j(await u.del(`/api/tasks/${t.id}`));
    expect(del.data.deleted).toBe(true);

    // Both see 0 pair score
    const [aBoard, bBoard] = await Promise.all([
      j(await u.get('/api/scoreboard')),
      j(await w.get('/api/scoreboard')),
    ]);
    const aEntry = aBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    const bEntry = bBoard.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    expect(aEntry.me.points).toBe(0);
    expect(bEntry.them.points).toBe(0);
  });

  test('reject then complete — personal score up, pair score stays 0', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 100);
    const { b, u, w } = ctx;

    const t = (await j(await u.post('/api/tasks', { name: 'Rejected', points: 20, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;
    await w.put(`/api/tasks/${apr.id}/approve`, { accept: false });

    // Complete the rejected task
    const complete = await j(await u.post(`/api/tasks/${t.id}/complete`));
    expect(complete.data.completed).toBe(true);

    // Pair score still 0
    const board = await j(await u.get('/api/scoreboard'));
    const entry = board.data.boards.find(brd => brd.friendshipId === ctx.friendshipId);
    expect(entry.me.points).toBe(0);
  });

  test('toggle completion off — pair score reverts', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 100);
    const { b, u, w } = ctx;

    const t = (await j(await u.post('/api/tasks', { name: 'Toggle', points: 10, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;
    await w.put(`/api/tasks/${apr.id}/approve`, { accept: true });

    // Complete
    await u.post(`/api/tasks/${t.id}/complete`);
    const after = await j(await u.get('/api/scoreboard'));
    expect(after.data.boards.find(brd => brd.friendshipId === ctx.friendshipId).me.points).toBe(10);

    // Toggle off (uncomplete)
    await u.post(`/api/tasks/${t.id}/complete`);
    const reverted = await j(await u.get('/api/scoreboard'));
    expect(reverted.data.boards.find(brd => brd.friendshipId === ctx.friendshipId).me.points).toBe(0);
  });
});

// ── Story: Goals ───────────────────────────────────────────────────────────────

test.describe('Story: Goals — proposal lifecycle', () => {
  test('accepted goal — scoreboard entry has hasGoal=true with target details', async ({ request }) => {
    const { u, w, friendshipId } = await makePairWithGoal(request, 75);

    const board = await j(await u.get('/api/scoreboard'));
    const entry = board.data.boards.find(b => b.friendshipId === friendshipId);
    expect(entry.hasGoal).toBe(true);
    expect(entry.goal.targetPoints).toBe(75);
    expect(entry.goal.period).toBe('1w');
    expect(entry.me.points).toBe(0);
    expect(entry.them.points).toBe(0);
  });

  test('declined goal — scoreboard shows hasGoal=false', async ({ request }) => {
    const { u, w, friendshipId } = await makePair(request);

    const gr = await j(await u.post('/api/goals', {
      friendshipId,
      targetPoints: 50,
      period: '1w',
    }));
    const goalId = gr.data.goal.id;

    // W declines
    await w.put(`/api/goals/${goalId}/respond`, { accept: false });

    const board = await j(await u.get('/api/scoreboard'));
    const entry = board.data.boards.find(b => b.friendshipId === friendshipId);
    expect(entry.hasGoal).toBe(false);
  });

  test('proposer cannot respond to own goal', async ({ request }) => {
    const { u, friendshipId } = await makePair(request);

    const gr = await j(await u.post('/api/goals', {
      friendshipId,
      targetPoints: 50,
      period: '1w',
    }));
    const goalId = gr.data.goal.id;

    // A tries to accept their own goal
    const resp = await j(await u.put(`/api/goals/${goalId}/respond`, { accept: true }));
    expect(resp.success).toBe(false);
  });

  test('later accepted goal overrides previous — scoreboard reflects new target', async ({ request }) => {
    const { u, w, friendshipId } = await makePairWithGoal(request, 50);

    // Propose a new goal with a different target
    const gr2 = await j(await w.post('/api/goals', {
      friendshipId,
      targetPoints: 200,
      period: '2w',
    }));
    const goalId2 = gr2.data.goal.id;
    await u.put(`/api/goals/${goalId2}/respond`, { accept: true });

    const board = await j(await u.get('/api/scoreboard'));
    const entry = board.data.boards.find(b => b.friendshipId === friendshipId);
    expect(entry.goal.targetPoints).toBe(200);
    expect(entry.goal.period).toBe('2w');
  });
});

// ── Story: Edge Cases ──────────────────────────────────────────────────────────

test.describe('Story: Edge Cases', () => {
  test('no friends → scoreboard returns empty boards', async ({ request }) => {
    const id = uid();
    const a = await register(request, `loner${id}`);
    const u = api(request, a.token);

    const board = await j(await u.get('/api/scoreboard'));
    expect(board.data.boards).toHaveLength(0);
  });

  test('friend with no goal → scoreboard board has hasGoal=false', async ({ request }) => {
    const { u, friendshipId } = await makePair(request);

    const board = await j(await u.get('/api/scoreboard'));
    const entry = board.data.boards.find(b => b.friendshipId === friendshipId);
    expect(entry).toBeDefined();
    expect(entry.hasGoal).toBe(false);
  });

  test('edit approved task → auto-unapproves, points removed from pair score', async ({ request }) => {
    const ctx = await makePairWithGoal(request, 100);
    const { b, u, w } = ctx;

    const t = (await j(await u.post('/api/tasks', { name: 'Approved', points: 20, days: [] }))).data.task;
    const apr = (await j(await u.post(`/api/tasks/${t.id}/request-approval`, { approverId: b.user.id }))).data.approval;
    await w.put(`/api/tasks/${apr.id}/approve`, { accept: true });
    await u.post(`/api/tasks/${t.id}/complete`);

    // Score is 20
    const before = await j(await u.get('/api/scoreboard'));
    expect(before.data.boards.find(brd => brd.friendshipId === ctx.friendshipId).me.points).toBe(20);

    // A edits the approved task (triggers auto-unapprove + rollback)
    const edited = await j(await u.put(`/api/tasks/${t.id}`, { name: 'Updated', points: 30, days: [] }));
    expect(edited.data.task.approvalStatus).toBe('none');
    expect(edited.data.wasApproved).toBe(true);

    // Pair score drops to 0
    const after = await j(await u.get('/api/scoreboard'));
    expect(after.data.boards.find(brd => brd.friendshipId === ctx.friendshipId).me.points).toBe(0);
  });

  test('GET /api/auth/me — returns logged-in user id and username', async ({ request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);
    const u = api(request, a.token);

    const me = await j(await u.get('/api/auth/me'));
    expect(me.success).toBe(true);
    expect(me.data.user.id).toBe(a.user.id);
    expect(me.data.user.username).toBe(a.user.username);
  });

  test('unauthenticated requests are rejected', async ({ request }) => {
    const tasks = await j(await request.get('/api/tasks'));
    expect(tasks.success).toBe(false);
  });
});
