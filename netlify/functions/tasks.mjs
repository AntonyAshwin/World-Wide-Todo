import { stores, requireAuth, ok, err, uid, today, addNotification, corsHeaders } from './_utils.mjs';

async function getUserTaskIds(userId) {
  return await stores.tasks().get(`user_tasks:${userId}`, { type: 'json' }) || [];
}

async function setUserTaskIds(userId, ids) {
  await stores.tasks().set(`user_tasks:${userId}`, JSON.stringify(ids));
}

async function getAcceptedFriends(userId) {
  const fStore = stores.friendships();
  const index = await fStore.get(`user_friendships:${userId}`, { type: 'json' }) || [];
  if (!index.length) return [];
  const recs = await Promise.all(index.map(id => fStore.get(`friendship:${id}`, { type: 'json' })));
  return recs.filter(f => f && f.status === 'accepted').map(f =>
    f.requesterId === userId ? f.receiverId : f.requesterId
  );
}

function taskAppearsToday(task) {
  if (task.days && task.days.length > 0) return task.days.includes(new Date().getDay());
  return task.createdAt.split('T')[0] === today();
}

// Cancels a pending approval: marks it 'cancelled', removes from approver's pending list.
// Called on edit or delete when task.approvalStatus === 'pending'.
async function cancelPendingApproval(task, aStore) {
  if (!task.activeApprovalId) return;
  const approval = await aStore.get(`approval:${task.activeApprovalId}`, { type: 'json' });
  if (!approval || approval.status !== 'pending') return;
  approval.status = 'cancelled';
  approval.updatedAt = new Date().toISOString();
  const pKey = `pending_approvals:${approval.approverId}`;
  const pList = await aStore.get(pKey, { type: 'json' }) || [];
  await Promise.all([
    aStore.set(`approval:${task.activeApprovalId}`, JSON.stringify(approval)),
    aStore.set(pKey, JSON.stringify(pList.filter(id => id !== task.activeApprovalId))),
  ]);
}

// Subtracts all approvedPoints for this task from approved_daily, resets records to approvedPoints=0.
// Used by: unapprove, edit-of-approved-task.
async function removeApprovedPoints(task, pStore, cStore) {
  const tcKey = `task_completions:${task.id}`;
  const list = await cStore.get(tcKey, { type: 'json' }) || [];

  if (list.length > 0) {
    const updated = await Promise.all(list.map(async entry => {
      const ap = entry.approvedPoints || 0;
      if (ap > 0) {
        const key = `approved_daily:${task.userId}:${entry.date}`;
        const rec = await pStore.get(key, { type: 'json' }) || { points: 0 };
        await pStore.set(key, JSON.stringify({ points: Math.max(0, rec.points - ap) }));
      }
      return { ...entry, approvedPoints: 0 };
    }));
    await cStore.set(tcKey, JSON.stringify(updated));
    await Promise.all(list.map(async entry => {
      const compKey = `completion:${task.userId}:${entry.date}:${task.id}`;
      const comp = await cStore.get(compKey, { type: 'json' });
      if (comp && comp.approvedPoints > 0) {
        await cStore.set(compKey, JSON.stringify({ ...comp, approvedPoints: 0 }));
      }
    }));
  }

  task.approvalStatus = 'none';
  task.approvedBy = null;
  task.activeApprovalId = null;
  task.updatedAt = new Date().toISOString();
}

// Adds newPoints for every historical completion to approved_daily, updates records.
// Used by: approve-respond when accepting.
async function applyApprovedPoints(task, newPoints, pStore, cStore) {
  const tcKey = `task_completions:${task.id}`;
  const list = await cStore.get(tcKey, { type: 'json' }) || [];
  if (!list.length) return;

  const updated = await Promise.all(list.map(async entry => {
    const key = `approved_daily:${task.userId}:${entry.date}`;
    const rec = await pStore.get(key, { type: 'json' }) || { points: 0 };
    await pStore.set(key, JSON.stringify({ points: rec.points + newPoints }));
    return { ...entry, approvedPoints: newPoints };
  }));

  await cStore.set(tcKey, JSON.stringify(updated));

  await Promise.all(list.map(async entry => {
    const compKey = `completion:${task.userId}:${entry.date}:${task.id}`;
    const comp = await cStore.get(compKey, { type: 'json' });
    if (comp) {
      await cStore.set(compKey, JSON.stringify({ ...comp, approvedPoints: newPoints }));
    }
  }));
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let caller;
  try { caller = await requireAuth(req); } catch (e) { return err(e.message, 401); }

  const { userId, username } = caller;
  const id = context.params.id;
  const action = context.params.action;
  const method = req.method;
  const tStore = stores.tasks();
  const aStore = stores.approvals();
  const pStore = stores.points();
  const cStore = stores.completions();

  // GET /api/tasks/today
  if (method === 'GET' && id === 'today') {
    const ids = await getUserTaskIds(userId);
    if (!ids.length) return ok({ tasks: [], date: today() });
    const tasks = (await Promise.all(ids.map(tid => tStore.get(`task:${tid}`, { type: 'json' })))).filter(Boolean);
    const todayStr = today();
    const todayTasks = tasks.filter(taskAppearsToday);
    const withCompletion = await Promise.all(todayTasks.map(async t => {
      const comp = await cStore.get(`completion:${userId}:${todayStr}:${t.id}`, { type: 'json' });
      return { ...t, completedToday: !!comp, completedPoints: comp ? comp.points : 0 };
    }));
    return ok({ tasks: withCompletion, date: todayStr });
  }

  // GET /api/tasks/approvals
  if (method === 'GET' && id === 'approvals') {
    const pKey = `pending_approvals:${userId}`;
    const pList = await aStore.get(pKey, { type: 'json' }) || [];
    if (!pList.length) return ok({ approvals: [] });
    const approvals = (await Promise.all(pList.map(aid => aStore.get(`approval:${aid}`, { type: 'json' }))))
      .filter(a => a && a.status === 'pending');
    return ok({ approvals });
  }

  // GET /api/tasks
  if (method === 'GET' && !id) {
    const ids = await getUserTaskIds(userId);
    if (!ids.length) return ok({ tasks: [] });
    const tasks = (await Promise.all(ids.map(tid => tStore.get(`task:${tid}`, { type: 'json' })))).filter(Boolean);
    return ok({ tasks });
  }

  // POST /api/tasks
  if (method === 'POST' && !id) {
    const { name, points, days } = await req.json();
    if (!name || !name.trim()) return err('Task name required');
    if (!points || points < 1 || points > 1000) return err('Points must be 1-1000');
    const validDays = Array.isArray(days) ? days.filter(d => d >= 0 && d <= 6) : [];
    const taskId = uid();
    const task = {
      id: taskId, userId, name: name.trim(), points: parseInt(points), days: validDays,
      approvalStatus: 'none', approvedBy: null, activeApprovalId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const ids = await getUserTaskIds(userId);
    await Promise.all([
      tStore.set(`task:${taskId}`, JSON.stringify(task)),
      setUserTaskIds(userId, [...ids, taskId]),
    ]);
    return ok({ task }, 201);
  }

  // PUT /api/tasks/:id — edit (works even if approved; resets approval)
  if (method === 'PUT' && id && !action) {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);

    const { name, points, days } = await req.json();
    const wasApproved = task.approvalStatus === 'approved';
    const oldPoints = task.points;
    const newPoints = points ? parseInt(points) : task.points;

    if (task.approvalStatus === 'pending') {
      await cancelPendingApproval(task, aStore);
    }
    if (wasApproved) {
      await removeApprovedPoints(task, pStore, cStore);
    }

    const validDays = Array.isArray(days) ? days.filter(d => d >= 0 && d <= 6) : task.days;
    task.name = name ? name.trim() : task.name;
    task.points = newPoints;
    task.days = validDays;
    task.approvalStatus = 'none';
    task.approvedBy = null;
    task.activeApprovalId = null;
    task.updatedAt = new Date().toISOString();

    // Sync today's completion record to match new task points (also heals pre-existing stale records)
    const todayStr = today();
    const compKey = `completion:${userId}:${todayStr}:${id}`;
    const comp = await cStore.get(compKey, { type: 'json' });
    if (comp && comp.points !== newPoints) {
      const diff = newPoints - comp.points;
      const dayKey = `daily:${userId}:${todayStr}`;
      const dayRec = await pStore.get(dayKey, { type: 'json' }) || { points: 0 };
      const tcKey = `task_completions:${id}`;
      const tcList = await cStore.get(tcKey, { type: 'json' }) || [];
      await Promise.all([
        pStore.set(dayKey, JSON.stringify({ points: Math.max(0, dayRec.points + diff) })),
        cStore.set(compKey, JSON.stringify({ ...comp, points: newPoints })),
        cStore.set(tcKey, JSON.stringify(tcList.map(e => e.date === todayStr ? { ...e, points: newPoints } : e))),
      ]);
    }

    await tStore.set(`task:${id}`, JSON.stringify(task));
    return ok({ task, wasApproved });
  }

  // POST /api/tasks/:id/unapprove
  if (method === 'POST' && id && action === 'unapprove') {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);
    if (task.approvalStatus !== 'approved') return err('Task is not approved');

    await removeApprovedPoints(task, pStore, cStore);
    await tStore.set(`task:${id}`, JSON.stringify(task));
    return ok({ task });
  }

  // DELETE /api/tasks/:id
  if (method === 'DELETE' && id && !action) {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);

    if (task.approvalStatus === 'pending') {
      await cancelPendingApproval(task, aStore);
    }

    const tcKey = `task_completions:${id}`;
    const taskCompletions = await cStore.get(tcKey, { type: 'json' }) || [];

    await Promise.all(taskCompletions.map(async ({ date, points: pts, approvedPoints: ap }) => {
      const writes = [cStore.delete(`completion:${userId}:${date}:${id}`)];
      if (pts > 0) {
        const dayKey = `daily:${userId}:${date}`;
        const dayRec = await pStore.get(dayKey, { type: 'json' }) || { points: 0 };
        writes.push(pStore.set(dayKey, JSON.stringify({ points: Math.max(0, dayRec.points - pts) })));
      }
      if (ap > 0) {
        const approvedKey = `approved_daily:${userId}:${date}`;
        const approvedRec = await pStore.get(approvedKey, { type: 'json' }) || { points: 0 };
        writes.push(pStore.set(approvedKey, JSON.stringify({ points: Math.max(0, approvedRec.points - ap) })));
      }
      await Promise.all(writes);
    }));

    await cStore.delete(tcKey);
    const ids = await getUserTaskIds(userId);
    await Promise.all([
      tStore.delete(`task:${id}`),
      setUserTaskIds(userId, ids.filter(tid => tid !== id)),
    ]);
    return ok({ deleted: true });
  }

  // POST /api/tasks/:id/complete — toggle
  if (method === 'POST' && id && action === 'complete') {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);

    const todayStr = today();
    const compKey = `completion:${userId}:${todayStr}:${id}`;
    const isApproved = task.approvalStatus === 'approved';

    const existing = await cStore.get(compKey, { type: 'json' });
    const dayKey = `daily:${userId}:${todayStr}`;
    const approvedDayKey = `approved_daily:${userId}:${todayStr}`;
    const [dayRec, approvedRec] = await Promise.all([
      pStore.get(dayKey, { type: 'json' }),
      pStore.get(approvedDayKey, { type: 'json' }),
    ]);
    const dayPts = (dayRec || { points: 0 }).points;
    const approvedPts = (approvedRec || { points: 0 }).points;

    if (existing) {
      const writes = [
        cStore.delete(compKey),
        pStore.set(dayKey, JSON.stringify({ points: Math.max(0, dayPts - existing.points) })),
      ];
      const ap = existing.approvedPoints || 0;
      if (ap > 0) writes.push(pStore.set(approvedDayKey, JSON.stringify({ points: Math.max(0, approvedPts - ap) })));

      const tcKey = `task_completions:${id}`;
      const tcList = await cStore.get(tcKey, { type: 'json' }) || [];
      writes.push(cStore.set(tcKey, JSON.stringify(tcList.filter(c => c.date !== todayStr))));
      await Promise.all(writes);
      return ok({ completed: false, points: task.points });
    } else {
      const ap = isApproved ? task.points : 0;
      const comp = { taskId: id, userId, date: todayStr, points: task.points, approvedPoints: ap, completedAt: new Date().toISOString() };
      const writes = [
        cStore.set(compKey, JSON.stringify(comp)),
        pStore.set(dayKey, JSON.stringify({ points: dayPts + task.points })),
      ];
      if (ap > 0) writes.push(pStore.set(approvedDayKey, JSON.stringify({ points: approvedPts + ap })));

      const tcKey = `task_completions:${id}`;
      const tcList = await cStore.get(tcKey, { type: 'json' }) || [];
      if (!tcList.find(c => c.date === todayStr)) {
        writes.push(cStore.set(tcKey, JSON.stringify([...tcList, { date: todayStr, points: task.points, approvedPoints: ap }])));
      }
      await Promise.all(writes);
      return ok({ completed: true, points: task.points });
    }
  }

  // POST /api/tasks/:id/request-approval
  if (method === 'POST' && id && action === 'request-approval') {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);
    if (task.approvalStatus === 'pending') return err('Approval request already pending');

    const { approverId } = await req.json();
    const friends = await getAcceptedFriends(userId);
    if (!friends.includes(approverId)) return err('Not a friend');

    const approvalId = uid();
    const approval = {
      id: approvalId, taskId: id, taskOwnerId: userId, approverId,
      type: 'create',
      pendingName: task.name, pendingPoints: task.points, pendingDays: task.days,
      status: 'pending',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await aStore.set(`approval:${approvalId}`, JSON.stringify(approval));

    task.approvalStatus = 'pending';
    task.activeApprovalId = approvalId;
    await tStore.set(`task:${id}`, JSON.stringify(task));

    const pKey = `pending_approvals:${approverId}`;
    const pList = await aStore.get(pKey, { type: 'json' }) || [];
    await aStore.set(pKey, JSON.stringify([...pList, approvalId]));

    await addNotification(approverId, 'task_approval_request', {
      approvalId, taskName: task.name, fromUsername: username,
    });
    return ok({ approval }, 201);
  }

  // PUT /api/tasks/:approvalId/approve — respond to approval
  if (method === 'PUT' && id && action === 'approve') {
    const approval = await aStore.get(`approval:${id}`, { type: 'json' });
    if (!approval) return err('Not found', 404);
    if (approval.approverId !== userId) return err('Forbidden', 403);
    if (approval.status !== 'pending') return err('Already responded');

    const { accept } = await req.json();
    approval.status = accept ? 'approved' : 'rejected';
    approval.updatedAt = new Date().toISOString();
    await aStore.set(`approval:${id}`, JSON.stringify(approval));

    const task = await tStore.get(`task:${approval.taskId}`, { type: 'json' });
    if (task) {
      if (accept) {
        const newPoints = approval.pendingPoints;
        // Apply approved points retroactively to all historical completions
        await applyApprovedPoints(task, newPoints, pStore, cStore);
        task.approvalStatus = 'approved';
        task.approvedBy = userId;
        task.name = approval.pendingName;
        task.points = newPoints;
        task.days = approval.pendingDays;
      } else {
        task.approvalStatus = 'none';
      }
      task.activeApprovalId = null;
      task.updatedAt = new Date().toISOString();
      await tStore.set(`task:${approval.taskId}`, JSON.stringify(task));
    }

    const pKey = `pending_approvals:${userId}`;
    const pList = await aStore.get(pKey, { type: 'json' }) || [];
    await aStore.set(pKey, JSON.stringify(pList.filter(aid => aid !== id)));

    await addNotification(approval.taskOwnerId, 'task_approval_response', {
      approvalId: id, taskName: approval.pendingName, accepted: accept, fromUsername: username,
    });
    return ok({ approval, task });
  }

  return err('Not found', 404);
};

export const config = {
  path: ['/api/tasks', '/api/tasks/:id', '/api/tasks/:id/:action'],
};
