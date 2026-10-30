import { describe, it, expect } from 'vitest';
import { createStore } from './mockStore.mjs';
import {
  cancelPendingApproval,
  removeApprovedPoints,
  applyApprovedPoints,
} from '../netlify/functions/tasks.mjs';

// ── cancelPendingApproval ─────────────────────────────────────────────────────

describe('cancelPendingApproval()', () => {
  it('no-ops when activeApprovalId is null', async () => {
    const aStore = createStore();
    const task = { approvalStatus: 'pending', activeApprovalId: null };
    await cancelPendingApproval(task, aStore);
    // nothing threw, store untouched
  });

  it('marks approval cancelled and removes from pending list', async () => {
    const approvalId = 'appr1';
    const aStore = createStore({
      [`approval:${approvalId}`]: {
        id: approvalId, status: 'pending', approverId: 'friend1',
      },
      'pending_approvals:friend1': ['appr1', 'appr2'],
    });
    const task = { activeApprovalId: approvalId };
    await cancelPendingApproval(task, aStore);

    const approval = aStore.peek(`approval:${approvalId}`);
    expect(approval.status).toBe('cancelled');

    const pending = aStore.peek('pending_approvals:friend1');
    expect(pending).not.toContain(approvalId);
    expect(pending).toContain('appr2'); // other approval untouched
  });

  it('no-ops when approval is already not pending', async () => {
    const approvalId = 'appr3';
    const aStore = createStore({
      [`approval:${approvalId}`]: { id: approvalId, status: 'approved', approverId: 'friend1' },
      'pending_approvals:friend1': [],
    });
    const task = { activeApprovalId: approvalId };
    await cancelPendingApproval(task, aStore);
    // approval stays 'approved', no error
    expect(aStore.peek(`approval:${approvalId}`).status).toBe('approved');
  });
});

// ── removeApprovedPoints ──────────────────────────────────────────────────────

describe('removeApprovedPoints()', () => {
  it('always sets approvalStatus to none — even with no completions', async () => {
    const task = {
      id: 't1', userId: 'u1',
      approvalStatus: 'approved', approvedBy: 'friend1', activeApprovalId: 'appr1',
    };
    const pStore = createStore();
    const cStore = createStore(); // no task_completions entry
    await removeApprovedPoints(task, pStore, cStore);

    expect(task.approvalStatus).toBe('none');
    expect(task.approvedBy).toBeNull();
    expect(task.activeApprovalId).toBeNull();
  });

  it('subtracts approvedPoints from approved_daily and zeros records', async () => {
    const task = { id: 't1', userId: 'u1', approvalStatus: 'approved', approvedBy: 'f1', activeApprovalId: null };
    const pStore = createStore({
      'approved_daily:u1:2024-01-01': { points: 10 },
      'approved_daily:u1:2024-01-02': { points: 8 },
    });
    const cStore = createStore({
      'task_completions:t1': [
        { date: '2024-01-01', points: 5, approvedPoints: 5 },
        { date: '2024-01-02', points: 3, approvedPoints: 3 },
      ],
      'completion:u1:2024-01-01:t1': { points: 5, approvedPoints: 5 },
      'completion:u1:2024-01-02:t1': { points: 3, approvedPoints: 3 },
    });

    await removeApprovedPoints(task, pStore, cStore);

    expect(pStore.peek('approved_daily:u1:2024-01-01').points).toBe(5);  // 10-5
    expect(pStore.peek('approved_daily:u1:2024-01-02').points).toBe(5);  // 8-3

    const tcList = cStore.peek('task_completions:t1');
    expect(tcList.every(e => e.approvedPoints === 0)).toBe(true);

    expect(cStore.peek('completion:u1:2024-01-01:t1').approvedPoints).toBe(0);
    expect(cStore.peek('completion:u1:2024-01-02:t1').approvedPoints).toBe(0);

    expect(task.approvalStatus).toBe('none');
  });

  it('does not go below zero on approved_daily', async () => {
    const task = { id: 't1', userId: 'u1', approvalStatus: 'approved', approvedBy: null, activeApprovalId: null };
    const pStore = createStore({ 'approved_daily:u1:2024-01-01': { points: 2 } });
    const cStore = createStore({
      'task_completions:t1': [{ date: '2024-01-01', points: 5, approvedPoints: 10 }],
      'completion:u1:2024-01-01:t1': { points: 5, approvedPoints: 10 },
    });

    await removeApprovedPoints(task, pStore, cStore);
    expect(pStore.peek('approved_daily:u1:2024-01-01').points).toBe(0); // clamped
  });
});

// ── applyApprovedPoints ───────────────────────────────────────────────────────

describe('applyApprovedPoints()', () => {
  it('no-ops when no completions', async () => {
    const task = { id: 't1', userId: 'u1' };
    const pStore = createStore();
    const cStore = createStore(); // empty
    await applyApprovedPoints(task, 5, pStore, cStore);
    // no writes, no errors
  });

  it('adds newPoints to approved_daily for every completion', async () => {
    const task = { id: 't1', userId: 'u1' };
    const pStore = createStore({
      'approved_daily:u1:2024-01-01': { points: 0 },
    });
    const cStore = createStore({
      'task_completions:t1': [
        { date: '2024-01-01', points: 5, approvedPoints: 0 },
        { date: '2024-01-02', points: 5, approvedPoints: 0 },
      ],
      'completion:u1:2024-01-01:t1': { taskId: 't1', points: 5, approvedPoints: 0 },
      'completion:u1:2024-01-02:t1': { taskId: 't1', points: 5, approvedPoints: 0 },
    });

    await applyApprovedPoints(task, 10, pStore, cStore);

    expect(pStore.peek('approved_daily:u1:2024-01-01').points).toBe(10);
    expect(pStore.peek('approved_daily:u1:2024-01-02').points).toBe(10);

    const tcList = cStore.peek('task_completions:t1');
    expect(tcList.every(e => e.approvedPoints === 10)).toBe(true);
    expect(cStore.peek('completion:u1:2024-01-01:t1').approvedPoints).toBe(10);
  });

  it('accumulates on top of existing approved_daily points', async () => {
    const task = { id: 't1', userId: 'u1' };
    const pStore = createStore({ 'approved_daily:u1:2024-01-01': { points: 20 } });
    const cStore = createStore({
      'task_completions:t1': [{ date: '2024-01-01', points: 5, approvedPoints: 0 }],
      'completion:u1:2024-01-01:t1': { points: 5, approvedPoints: 0 },
    });

    await applyApprovedPoints(task, 5, pStore, cStore);
    expect(pStore.peek('approved_daily:u1:2024-01-01').points).toBe(25); // 20+5
  });
});
