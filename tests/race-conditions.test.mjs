/**
 * Race-condition tests.
 *
 * The old code used read-modify-write on JSON arrays for both addNotification
 * and pending_approvals. Concurrent writes caused last-writer-wins data loss.
 *
 * The fix: individual blob keys (one key per item) — each write is atomic,
 * no read needed. These tests verify the new behaviour:
 *   - N concurrent writes all survive (none overwrite each other)
 *   - add/remove touch only the targeted key, not siblings
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createStore } from './mockStore.mjs';
import { createToken } from '../netlify/functions/_utils.mjs';

// ── @netlify/blobs mock shared with task-handler tests ───────────────────────

const storeMap = {};

vi.mock('@netlify/blobs', () => ({
  getStore: ({ name }) => storeMap[name],
}));

const { default: handler } = await import('../netlify/functions/tasks.mjs');
const { addNotification } = await import('../netlify/functions/_utils.mjs');

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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function ctx(id, action) { return { params: { id, action } }; }
async function json(res) { return res.json(); }

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

// ── addNotification — concurrent writes all survive ───────────────────────────

describe('addNotification — no read-modify-write', () => {
  it('N concurrent notifications all get unique keys', async () => {
    const nStore = createStore();
    storeMap.notifications = nStore;

    const types = ['friend_request', 'task_approval_request', 'friend_response'];
    await Promise.all(types.map(type =>
      addNotification('bob', type, { fromUsername: 'alice' })
    ));

    const { blobs } = await nStore.list({ prefix: 'notif:bob:' });
    expect(blobs).toHaveLength(3);

    const keys = blobs.map(b => b.key);
    // All keys are distinct (no overwriting)
    expect(new Set(keys).size).toBe(3);
  });

  it('each notification written to its own key — no shared state', async () => {
    const nStore = createStore();
    storeMap.notifications = nStore;

    await addNotification('bob', 'friend_request', { fromUsername: 'alice' });
    await addNotification('bob', 'task_approval_request', { fromUsername: 'carol' });

    const { blobs } = await nStore.list({ prefix: 'notif:bob:' });
    expect(blobs).toHaveLength(2);

    const notifs = await Promise.all(blobs.map(b => nStore.get(b.key, { type: 'json' })));
    const types = notifs.map(n => n.type);
    expect(types).toContain('friend_request');
    expect(types).toContain('task_approval_request');
  });

  it('different users\' notifications are fully isolated', async () => {
    const nStore = createStore();
    storeMap.notifications = nStore;

    await Promise.all([
      addNotification('alice', 'friend_request', { fromUsername: 'bob' }),
      addNotification('bob', 'friend_request', { fromUsername: 'alice' }),
    ]);

    const aliceBlobs = (await nStore.list({ prefix: 'notif:alice:' })).blobs;
    const bobBlobs   = (await nStore.list({ prefix: 'notif:bob:' })).blobs;
    expect(aliceBlobs).toHaveLength(1);
    expect(bobBlobs).toHaveLength(1);
  });
});

// ── pending_approval — concurrent approval requests all survive ───────────────

describe('POST /api/tasks/:id/request-approval — atomic individual keys', () => {
  it('requesting approval writes one individual key, not an array', async () => {
    const FRIEND_ID = 'friend1';
    const task = {
      id: 'task1', userId: USER_ID, name: 'Run', points: 5, days: [],
      approvalStatus: 'none', approvedBy: null, activeApprovalId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    storeMap.tasks = createStore({ 'task:task1': task });
    storeMap.friendships = createStore({
      [`user_friendships:${USER_ID}`]: ['f1'],
      'friendship:f1': {
        id: 'f1', requesterId: USER_ID, receiverId: FRIEND_ID, status: 'accepted',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    });

    const res = await handler(
      req('POST', 'task1', 'request-approval', { approverId: FRIEND_ID }),
      ctx('task1', 'request-approval'),
    );
    const body = await json(res);
    expect(res.status).toBe(201);

    const approvalId = body.data.approval.id;

    // New schema: individual key exists
    expect(storeMap.approvals.has(`pending_approval:${FRIEND_ID}:${approvalId}`)).toBe(true);
    // Old schema: array key does NOT exist
    expect(storeMap.approvals.has(`pending_approvals:${FRIEND_ID}`)).toBe(false);
  });

  it('two sequential requests to same approver both appear in list', async () => {
    const FRIEND_ID = 'friend1';
    const t1 = {
      id: 'task1', userId: USER_ID, name: 'Run', points: 5, days: [],
      approvalStatus: 'none', approvedBy: null, activeApprovalId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const t2 = { ...t1, id: 'task2', name: 'Walk' };
    storeMap.tasks = createStore({
      'task:task1': t1, 'task:task2': t2,
      [`user_tasks:${USER_ID}`]: ['task1', 'task2'],
    });
    storeMap.friendships = createStore({
      [`user_friendships:${USER_ID}`]: ['f1'],
      'friendship:f1': {
        id: 'f1', requesterId: USER_ID, receiverId: FRIEND_ID, status: 'accepted',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    });

    // Sequential requests (as the frontend does)
    await handler(req('POST', 'task1', 'request-approval', { approverId: FRIEND_ID }), ctx('task1', 'request-approval'));
    await handler(req('POST', 'task2', 'request-approval', { approverId: FRIEND_ID }), ctx('task2', 'request-approval'));

    // Both individual keys present
    const { blobs } = await storeMap.approvals.list({ prefix: `pending_approval:${FRIEND_ID}:` });
    expect(blobs).toHaveLength(2);
  });
});

// ── pending_approval — respond removes only the target key ────────────────────

describe('PUT /api/tasks/:approvalId/approve — atomic delete', () => {
  it('responding removes only the responded-to key, sibling untouched', async () => {
    const APPROVER_ID = USER_ID;
    const a1 = 'appr-respond';
    const a2 = 'appr-sibling';
    const taskForApproval = {
      id: 'task-a1', userId: 'owner1', name: 'Run', points: 5, days: [],
      approvalStatus: 'pending', approvedBy: null, activeApprovalId: a1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    storeMap.users = createStore({
      [`user:${APPROVER_ID}`]: { id: APPROVER_ID, username: 'alice' },
      'user:owner1': { id: 'owner1', username: 'bob' },
    });
    storeMap.tasks = createStore({ 'task:task-a1': taskForApproval });
    storeMap.approvals = createStore({
      [`pending_approval:${APPROVER_ID}:${a1}`]: '1',
      [`pending_approval:${APPROVER_ID}:${a2}`]: '1',
      [`approval:${a1}`]: {
        id: a1, taskId: 'task-a1', taskOwnerId: 'owner1', approverId: APPROVER_ID,
        status: 'pending', type: 'create',
        pendingName: 'Run', pendingPoints: 5, pendingDays: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    });

    const res = await handler(req('PUT', a1, 'approve', { accept: true }), ctx(a1, 'approve'));
    expect(res.status).toBe(200);

    // Responded-to key deleted
    expect(storeMap.approvals.has(`pending_approval:${APPROVER_ID}:${a1}`)).toBe(false);
    // Sibling untouched
    expect(storeMap.approvals.has(`pending_approval:${APPROVER_ID}:${a2}`)).toBe(true);
  });
});
