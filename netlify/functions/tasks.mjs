import { stores, requireAuth, ok, err, uid, today, addNotification, corsHeaders } from './_utils.mjs';

async function getUserTaskIds(userId) {
  const store = stores.tasks();
  return await store.get(`user_tasks:${userId}`, { type: 'json' }) || [];
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
  if (task.days && task.days.length > 0) {
    const dow = new Date().getDay();
    return task.days.includes(dow);
  }
  return task.createdAt.split('T')[0] === today();
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

  // GET /api/tasks/today
  if (method === 'GET' && id === 'today') {
    const ids = await getUserTaskIds(userId);
    if (!ids.length) return ok({ tasks: [] });
    const tasks = (await Promise.all(ids.map(tid => tStore.get(`task:${tid}`, { type: 'json' })))).filter(Boolean);
    const todayStr = today();
    const cStore = stores.completions();
    const todayTasks = tasks.filter(taskAppearsToday);
    const withCompletion = await Promise.all(todayTasks.map(async t => {
      const comp = await cStore.get(`completion:${userId}:${todayStr}:${t.id}`, { type: 'json' });
      return { ...t, completedToday: !!comp, completedPoints: comp ? comp.points : 0 };
    }));
    return ok({ tasks: withCompletion, date: todayStr });
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
      id: taskId,
      userId,
      name: name.trim(),
      points: parseInt(points),
      days: validDays,
      approvalStatus: 'none',
      approvedBy: null,
      activeApprovalId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ids = await getUserTaskIds(userId);
    await Promise.all([
      tStore.set(`task:${taskId}`, JSON.stringify(task)),
      setUserTaskIds(userId, [...ids, taskId]),
    ]);
    return ok({ task }, 201);
  }

  // PUT /api/tasks/:id
  if (method === 'PUT' && id && !action) {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);

    const { name, points, days } = await req.json();
    if (task.approvalStatus === 'approved') {
      return err('Task is approved. Send an edit request to a friend first.');
    }
    const validDays = Array.isArray(days) ? days.filter(d => d >= 0 && d <= 6) : task.days;
    task.name = name ? name.trim() : task.name;
    task.points = points ? parseInt(points) : task.points;
    task.days = validDays;
    task.updatedAt = new Date().toISOString();
    await tStore.set(`task:${id}`, JSON.stringify(task));
    return ok({ task });
  }

  // DELETE /api/tasks/:id
  if (method === 'DELETE' && id && !action) {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);

    // Remove accumulated points from daily totals
    const cStore = stores.completions();
    const pStore = stores.points();
    const tcKey = `task_completions:${id}`;
    const taskCompletions = await cStore.get(tcKey, { type: 'json' }) || [];

    await Promise.all(taskCompletions.map(async ({ date, points: pts }) => {
      const dayKey = `daily:${userId}:${date}`;
      const dayRec = await pStore.get(dayKey, { type: 'json' }) || { points: 0 };
      await pStore.set(dayKey, JSON.stringify({ points: Math.max(0, dayRec.points - pts) }));
      await cStore.delete(`completion:${userId}:${date}:${id}`);
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
    const cStore = stores.completions();
    const pStore = stores.points();
    const compKey = `completion:${userId}:${todayStr}:${id}`;
    const dayKey = `daily:${userId}:${todayStr}`;

    const existing = await cStore.get(compKey, { type: 'json' });
    const dayRec = await pStore.get(dayKey, { type: 'json' }) || { points: 0 };

    if (existing) {
      // Un-complete: deregister points
      await cStore.delete(compKey);
      await pStore.set(dayKey, JSON.stringify({ points: Math.max(0, dayRec.points - existing.points) }));
      // Remove from task completion index
      const tcKey = `task_completions:${id}`;
      const tcList = await cStore.get(tcKey, { type: 'json' }) || [];
      await cStore.set(tcKey, JSON.stringify(tcList.filter(c => c.date !== todayStr)));
      return ok({ completed: false, points: task.points });
    } else {
      // Complete: register points
      const comp = { taskId: id, userId, date: todayStr, points: task.points, completedAt: new Date().toISOString() };
      await cStore.set(compKey, JSON.stringify(comp));
      await pStore.set(dayKey, JSON.stringify({ points: dayRec.points + task.points }));
      // Add to task completion index (for delete cleanup)
      const tcKey = `task_completions:${id}`;
      const tcList = await cStore.get(tcKey, { type: 'json' }) || [];
      if (!tcList.find(c => c.date === todayStr)) {
        await cStore.set(tcKey, JSON.stringify([...tcList, { date: todayStr, points: task.points }]));
      }
      return ok({ completed: true, points: task.points });
    }
  }

  // POST /api/tasks/:id/request-approval
  if (method === 'POST' && id && action === 'request-approval') {
    const task = await tStore.get(`task:${id}`, { type: 'json' });
    if (!task) return err('Not found', 404);
    if (task.userId !== userId) return err('Forbidden', 403);
    if (task.approvalStatus === 'pending') return err('Approval request already pending');

    const { approverId, pendingName, pendingPoints, pendingDays } = await req.json();
    const friends = await getAcceptedFriends(userId);
    if (!friends.includes(approverId)) return err('Not a friend');

    const approvalId = uid();
    const isEdit = task.approvalStatus === 'approved';
    const approval = {
      id: approvalId,
      taskId: id,
      taskOwnerId: userId,
      approverId,
      type: isEdit ? 'edit' : 'create',
      pendingName: pendingName || task.name,
      pendingPoints: pendingPoints || task.points,
      pendingDays: pendingDays || task.days,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await aStore.set(`approval:${approvalId}`, JSON.stringify(approval));

    task.approvalStatus = 'pending';
    task.activeApprovalId = approvalId;
    await tStore.set(`task:${id}`, JSON.stringify(task));

    // Index for the approver's pending list
    const pKey = `pending_approvals:${approverId}`;
    const pList = await aStore.get(pKey, { type: 'json' }) || [];
    await aStore.set(pKey, JSON.stringify([...pList, approvalId]));

    const approverUser = await stores.users().get(`user:${approverId}`, { type: 'json' });
    await addNotification(approverId, 'task_approval_request', {
      approvalId,
      taskName: task.name,
      fromUsername: username,
    });
    return ok({ approval }, 201);
  }

  // PUT /api/tasks/approvals/:id/respond — embedded under tasks for simplicity
  if (method === 'PUT' && id && action === 'approve') {
    // id here is approvalId
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
        task.approvalStatus = 'approved';
        task.approvedBy = userId;
        if (approval.type === 'edit') {
          task.name = approval.pendingName;
          task.points = approval.pendingPoints;
          task.days = approval.pendingDays;
        }
      } else {
        task.approvalStatus = task.approvedBy ? 'approved' : 'none';
      }
      task.activeApprovalId = null;
      task.updatedAt = new Date().toISOString();
      await tStore.set(`task:${approval.taskId}`, JSON.stringify(task));
    }

    // Remove from pending list
    const pKey = `pending_approvals:${userId}`;
    const pList = await aStore.get(pKey, { type: 'json' }) || [];
    await aStore.set(pKey, JSON.stringify(pList.filter(aid => aid !== id)));

    await addNotification(approval.taskOwnerId, 'task_approval_response', {
      approvalId: id,
      taskName: approval.pendingName,
      accepted: accept,
      fromUsername: username,
    });
    return ok({ approval, task });
  }

  // GET /api/tasks/approvals — list pending approvals for caller
  if (method === 'GET' && id === 'approvals') {
    const pKey = `pending_approvals:${userId}`;
    const pList = await aStore.get(pKey, { type: 'json' }) || [];
    if (!pList.length) return ok({ approvals: [] });
    const approvals = (await Promise.all(pList.map(aid => aStore.get(`approval:${aid}`, { type: 'json' }))))
      .filter(a => a && a.status === 'pending');
    return ok({ approvals });
  }

  return err('Not found', 404);
};

export const config = {
  path: [
    '/api/tasks',
    '/api/tasks/:id',
    '/api/tasks/:id/:action',
  ],
};
