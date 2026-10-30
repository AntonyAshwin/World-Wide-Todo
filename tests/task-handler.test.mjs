import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createStore } from './mockStore.mjs';
import { createToken } from '../netlify/functions/_utils.mjs';

// Module-level map so the factory closure can reference it at call time
const storeMap = {};

vi.mock('@netlify/blobs', () => ({
  getStore: ({ name }) => storeMap[name],
}));

// Dynamic import so vi.mock is fully hoisted first
const { default: handler } = await import('../netlify/functions/tasks.mjs');

// ── helpers ───────────────────────────────────────────────────────────────────

const USER_ID = 'u1';
const TOKEN = createToken(USER_ID);

function req(method, id, action, body = null) {
  const url = action
    ? `http://localhost/api/tasks/${id}/${action}`
    : id
    ? `http://localhost/api/tasks/${id}`
    : 'http://localhost/api/tasks';
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function ctx(id = undefined, action = undefined) {
  return { params: { id, action } };
}

async function json(res) {
  return res.json();
}

function baseTask(overrides = {}) {
  return {
    id: 'task1', userId: USER_ID, name: 'Run', points: 5, days: [],
    approvalStatus: 'none', approvedBy: null, activeApprovalId: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  storeMap.users = createStore({ [`user:${USER_ID}`]: { id: USER_ID, username: 'alice' } });
  storeMap.tasks = createStore();
  storeMap.approvals = createStore();
  storeMap.points = createStore();
  storeMap.completions = createStore();
  storeMap.notifications = createStore();
  storeMap.friendships = createStore();
  storeMap.goals = createStore();
});

// ── complete toggle ───────────────────────────────────────────────────────────

describe('POST /api/tasks/:id/complete — toggle', () => {
  it('marks complete, adds points to daily', async () => {
    const task = baseTask();
    storeMap.tasks = createStore({
      'task:task1': task,
      [`user_tasks:${USER_ID}`]: ['task1'],
    });

    const res = await handler(req('POST', 'task1', 'complete'), ctx('task1', 'complete'));
    const body = await json(res);
    expect(body.data.completed).toBe(true);
    expect(body.data.points).toBe(5);

    const daily = storeMap.points.peek(`daily:${USER_ID}:${new Date().toISOString().split('T')[0]}`);
    expect(daily.points).toBe(5);
  });

  it('untoggle removes points from daily', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const task = baseTask();
    storeMap.tasks = createStore({ 'task:task1': task });
    storeMap.points = createStore({ [`daily:${USER_ID}:${todayStr}`]: { points: 5 } });
    storeMap.completions = createStore({
      [`completion:${USER_ID}:${todayStr}:task1`]: {
        taskId: 'task1', userId: USER_ID, date: todayStr, points: 5, approvedPoints: 0,
        completedAt: new Date().toISOString(),
      },
      'task_completions:task1': [{ date: todayStr, points: 5, approvedPoints: 0 }],
    });

    const res = await handler(req('POST', 'task1', 'complete'), ctx('task1', 'complete'));
    const body = await json(res);
    expect(body.data.completed).toBe(false);

    const daily = storeMap.points.peek(`daily:${USER_ID}:${todayStr}`);
    expect(daily.points).toBe(0);
  });

  it('approved task also updates approved_daily', async () => {
    const task = baseTask({ approvalStatus: 'approved', approvedBy: 'friend1' });
    storeMap.tasks = createStore({ 'task:task1': task });

    const res = await handler(req('POST', 'task1', 'complete'), ctx('task1', 'complete'));
    const body = await json(res);
    expect(body.data.completed).toBe(true);

    const todayStr = new Date().toISOString().split('T')[0];
    const approved = storeMap.points.peek(`approved_daily:${USER_ID}:${todayStr}`);
    expect(approved.points).toBe(5);
  });
});

// ── edit cancels pending approval ─────────────────────────────────────────────

describe('PUT /api/tasks/:id — edit', () => {
  it('cancels pending approval on edit', async () => {
    const approvalId = 'appr1';
    const task = baseTask({ approvalStatus: 'pending', activeApprovalId: approvalId });
    storeMap.tasks = createStore({ 'task:task1': task });
    storeMap.approvals = createStore({
      [`approval:${approvalId}`]: {
        id: approvalId, status: 'pending', approverId: 'friend1',
      },
      'pending_approval:friend1:appr1': '1',
    });

    const res = await handler(
      req('PUT', 'task1', undefined, { name: 'Run fast', points: 5, days: [] }),
      ctx('task1'),
    );
    const body = await json(res);
    expect(res.status).toBe(200);

    const approval = storeMap.approvals.peek(`approval:${approvalId}`);
    expect(approval.status).toBe('cancelled');

    expect(storeMap.approvals.has('pending_approval:friend1:appr1')).toBe(false);
  });

  it('resets approvalStatus to none when editing approved task', async () => {
    const task = baseTask({ approvalStatus: 'approved', approvedBy: 'friend1' });
    storeMap.tasks = createStore({ 'task:task1': task });

    const res = await handler(
      req('PUT', 'task1', undefined, { name: 'Updated', points: 10, days: [] }),
      ctx('task1'),
    );
    const body = await json(res);
    expect(body.data.task.approvalStatus).toBe('none');
    expect(body.data.wasApproved).toBe(true);
  });

  it('syncs today completion points when task points change', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const task = baseTask({ points: 5 });
    storeMap.tasks = createStore({ 'task:task1': task });
    storeMap.completions = createStore({
      [`completion:${USER_ID}:${todayStr}:task1`]: {
        taskId: 'task1', userId: USER_ID, date: todayStr, points: 5, approvedPoints: 0,
        completedAt: new Date().toISOString(),
      },
      'task_completions:task1': [{ date: todayStr, points: 5, approvedPoints: 0 }],
    });
    storeMap.points = createStore({ [`daily:${USER_ID}:${todayStr}`]: { points: 5 } });

    await handler(req('PUT', 'task1', undefined, { name: 'Run', points: 10, days: [] }), ctx('task1'));

    const daily = storeMap.points.peek(`daily:${USER_ID}:${todayStr}`);
    expect(daily.points).toBe(10); // was 5, diff +5
    const comp = storeMap.completions.peek(`completion:${USER_ID}:${todayStr}:task1`);
    expect(comp.points).toBe(10);
  });
});

// ── delete cancels pending approval ───────────────────────────────────────────

describe('DELETE /api/tasks/:id', () => {
  it('cancels pending approval on delete', async () => {
    const approvalId = 'appr2';
    const task = baseTask({ approvalStatus: 'pending', activeApprovalId: approvalId });
    storeMap.tasks = createStore({
      'task:task1': task,
      [`user_tasks:${USER_ID}`]: ['task1'],
    });
    storeMap.approvals = createStore({
      [`approval:${approvalId}`]: {
        id: approvalId, status: 'pending', approverId: 'friend1',
      },
      'pending_approval:friend1:appr2': '1',
    });

    const res = await handler(req('DELETE', 'task1'), ctx('task1'));
    const body = await json(res);
    expect(body.data.deleted).toBe(true);

    const approval = storeMap.approvals.peek(`approval:${approvalId}`);
    expect(approval.status).toBe('cancelled');
    expect(storeMap.approvals.has('pending_approval:friend1:appr2')).toBe(false);
  });

  it('removes task from user_tasks index', async () => {
    const task = baseTask();
    storeMap.tasks = createStore({
      'task:task1': task,
      [`user_tasks:${USER_ID}`]: ['task1', 'task2'],
    });

    await handler(req('DELETE', 'task1'), ctx('task1'));

    const ids = storeMap.tasks.peek(`user_tasks:${USER_ID}`);
    expect(ids).not.toContain('task1');
    expect(ids).toContain('task2');
  });

  it('rollbacks daily points on delete if task was completed today', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const task = baseTask();
    storeMap.tasks = createStore({
      'task:task1': task,
      [`user_tasks:${USER_ID}`]: ['task1'],
    });
    storeMap.points = createStore({ [`daily:${USER_ID}:${todayStr}`]: { points: 5 } });
    storeMap.completions = createStore({
      [`completion:${USER_ID}:${todayStr}:task1`]: {
        taskId: 'task1', userId: USER_ID, date: todayStr, points: 5, approvedPoints: 0,
      },
      'task_completions:task1': [{ date: todayStr, points: 5, approvedPoints: 0 }],
    });

    await handler(req('DELETE', 'task1'), ctx('task1'));

    const daily = storeMap.points.peek(`daily:${USER_ID}:${todayStr}`);
    expect(daily.points).toBe(0);
  });
});

// ── GET /api/tasks/approvals — ownerUsername enrichment (bug fix) ─────────────

describe('GET /api/tasks/approvals', () => {
  it('returns empty array when no pending approvals', async () => {
    storeMap.approvals = createStore(); // no pending_approval: keys
    const res = await handler(req('GET', 'approvals', undefined), ctx('approvals'));
    const body = await json(res);
    expect(body.data.approvals).toEqual([]);
  });

  it('enriches approvals with ownerUsername', async () => {
    const approvalId = 'appr-enrich';
    storeMap.users = createStore({
      [`user:${USER_ID}`]: { id: USER_ID, username: 'alice' },
      'user:owner1': { id: 'owner1', username: 'bob' },
    });
    storeMap.approvals = createStore({
      [`pending_approval:${USER_ID}:${approvalId}`]: '1',
      [`approval:${approvalId}`]: {
        id: approvalId, taskId: 'task1', taskOwnerId: 'owner1', approverId: USER_ID,
        type: 'create', pendingName: 'Run', pendingPoints: 10, pendingDays: [],
        status: 'pending',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    });

    const res = await handler(req('GET', 'approvals', undefined), ctx('approvals'));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.data.approvals).toHaveLength(1);
    expect(body.data.approvals[0].ownerUsername).toBe('bob');
    expect(body.data.approvals[0].taskId).toBe('task1');
  });

  it('filters out non-pending approvals', async () => {
    const a1 = 'appr-pending';
    const a2 = 'appr-cancelled';
    storeMap.users = createStore({
      [`user:${USER_ID}`]: { id: USER_ID, username: 'alice' },
      'user:owner1': { id: 'owner1', username: 'bob' },
    });
    storeMap.approvals = createStore({
      [`pending_approval:${USER_ID}:${a1}`]: '1',
      [`pending_approval:${USER_ID}:${a2}`]: '1',
      [`approval:${a1}`]: {
        id: a1, taskOwnerId: 'owner1', approverId: USER_ID, status: 'pending',
        type: 'create', pendingName: 'Run', pendingPoints: 5, pendingDays: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      [`approval:${a2}`]: {
        id: a2, taskOwnerId: 'owner1', approverId: USER_ID, status: 'cancelled',
        type: 'create', pendingName: 'Walk', pendingPoints: 3, pendingDays: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    });

    const res = await handler(req('GET', 'approvals', undefined), ctx('approvals'));
    const body = await json(res);
    expect(body.data.approvals).toHaveLength(1);
    expect(body.data.approvals[0].id).toBe(a1);
  });

  it('handles missing owner user gracefully (ownerUsername null)', async () => {
    const approvalId = 'appr-ghost';
    storeMap.approvals = createStore({
      [`pending_approval:${USER_ID}:${approvalId}`]: '1',
      [`approval:${approvalId}`]: {
        id: approvalId, taskOwnerId: 'deleted-user', approverId: USER_ID,
        status: 'pending', type: 'create', pendingName: 'Run', pendingPoints: 5, pendingDays: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    });

    const res = await handler(req('GET', 'approvals', undefined), ctx('approvals'));
    const body = await json(res);
    expect(body.data.approvals[0].ownerUsername).toBeNull();
  });
});
