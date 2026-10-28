import { api } from '../js/api.js';
import { showToast } from '../app.js';
import { state } from '../js/state.js';

const PERIOD_LABELS = { '1w': '1 Week', '2w': '2 Weeks', '3w': '3 Weeks', '1m': '1 Month' };

export function render(container) {
  let friendships = [];
  let goalsData = [];
  let pendingApprovals = [];
  let notifications = [];

  async function load() {
    container.innerHTML = loadingHTML();
    try {
      const [fd, gd, apd, nd] = await Promise.all([
        api.friends.list(),
        api.goals.list(),
        api.tasks.pendingApprovals(),
        api.notifications.list(),
      ]);
      friendships = fd.friendships.filter(f => f.status === 'accepted');
      goalsData = gd.goals;
      pendingApprovals = apd.approvals;
      notifications = nd.notifications;
      await api.notifications.markRead();
      renderPage();
    } catch (e) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">${e.message}</div></div>`;
    }
  }

  function renderPage() {
    container.innerHTML = `
      <div style="padding-top:8px">
        ${pendingApprovals.length ? `
          <div class="section-header"><span class="section-title">Awaiting Your Approval (${pendingApprovals.length})</span></div>
          <div id="approvals-list">${pendingApprovals.map(approvalHTML).join('')}</div>
        ` : ''}

        <div class="section-header" style="margin-top:8px">
          <span class="section-title">Goals</span>
          ${friendships.length ? `<button class="btn btn-ghost btn-sm" id="propose-goal-btn">+ Propose</button>` : ''}
        </div>
        ${goalsData.length ? goalsData.map(goalGroupHTML).join('') : `<div class="empty"><div class="empty-icon">🎯</div><div class="empty-text">No goals yet</div><div class="empty-sub">Add friends first, then set a goal</div></div>`}

        ${notifications.length ? `
          <div class="section-header" style="margin-top:8px"><span class="section-title">Recent Activity</span></div>
          <div class="card" style="padding:0">
            ${notifications.slice(0, 20).map(notifHTML).join('')}
          </div>
        ` : ''}
        <div style="height:24px"></div>
      </div>
    `;

    container.querySelectorAll('[data-approve-task]').forEach(btn =>
      btn.addEventListener('click', () => respondApproval(btn.dataset.approveTask, true)));
    container.querySelectorAll('[data-reject-task]').forEach(btn =>
      btn.addEventListener('click', () => respondApproval(btn.dataset.rejectTask, false)));
    container.querySelectorAll('[data-accept-goal]').forEach(btn =>
      btn.addEventListener('click', () => respondGoal(btn.dataset.acceptGoal, true)));
    container.querySelectorAll('[data-reject-goal]').forEach(btn =>
      btn.addEventListener('click', () => respondGoal(btn.dataset.rejectGoal, false)));

    const propBtn = container.querySelector('#propose-goal-btn');
    if (propBtn) propBtn.addEventListener('click', () => openProposeModal());
  }

  function approvalHTML(a) {
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const daysStr = a.pendingDays && a.pendingDays.length ? a.pendingDays.map(d => dayNames[d]).join(', ') : 'Today only';
    return `
      <div class="card">
        <div style="font-size:13px;color:var(--text2);margin-bottom:4px">${a.type === 'edit' ? 'Edit request' : 'New task'} from someone</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:2px">${escHtml(a.pendingName)}</div>
        <div style="font-size:13px;color:var(--text3)">${a.pendingPoints} pts · ${daysStr}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-outline btn-full btn-sm" data-reject-task="${a.id}">Reject</button>
          <button class="btn btn-success btn-full btn-sm" data-approve-task="${a.id}">Approve ✓</button>
        </div>
      </div>
    `;
  }

  function goalGroupHTML(g) {
    const friendName = g.friend ? g.friend.username : '?';
    return `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">vs @${escHtml(friendName)}</div>
        ${g.activeGoal ? `
          <div style="font-size:13px;color:var(--text2);margin-bottom:8px">
            Active: <strong>${g.activeGoal.targetPoints} pts</strong> / ${PERIOD_LABELS[g.activeGoal.period]}
            <span style="font-size:11px;color:var(--text3)"> (started ${fmtDate(g.activeGoal.activatedAt)})</span>
          </div>
        ` : `<div style="font-size:13px;color:var(--text3);margin-bottom:8px">No active goal</div>`}
        ${g.pendingProposals.map(p => pendingGoalHTML(p)).join('')}
      </div>
    `;
  }

  function pendingGoalHTML(p) {
    const isMyProposal = p.proposerId === state.user?.id;
    return `
      <div style="background:var(--primary-light);border-radius:8px;padding:10px;margin-top:8px">
        <div style="font-size:13px;font-weight:600">${isMyProposal ? 'Your proposal' : 'Proposed to you'}</div>
        <div style="font-size:14px;margin:4px 0"><strong>${p.targetPoints} pts</strong> / ${PERIOD_LABELS[p.period]}</div>
        ${!isMyProposal ? `
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-outline btn-sm btn-full" data-reject-goal="${p.id}">Decline</button>
            <button class="btn btn-primary btn-sm btn-full" data-accept-goal="${p.id}">Accept</button>
          </div>
        ` : `<div style="font-size:11px;color:var(--text3);margin-top:4px">Waiting for response…</div>`}
      </div>
    `;
  }

  function notifHTML(n) {
    const msg = notifMessage(n);
    const time = new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        ${!n.read ? '<div class="notif-dot"></div>' : '<div style="width:8px;flex-shrink:0"></div>'}
        <div>
          <div class="notif-text">${msg}</div>
          <div class="notif-time">${time}</div>
        </div>
      </div>
    `;
  }

  function notifMessage(n) {
    const d = n.data || {};
    switch (n.type) {
      case 'friend_request': return `<strong>@${escHtml(d.fromUsername)}</strong> sent you a friend request`;
      case 'friend_response': return `<strong>@${escHtml(d.fromUsername)}</strong> ${d.accepted ? 'accepted' : 'declined'} your friend request`;
      case 'task_approval_request': return `<strong>@${escHtml(d.fromUsername)}</strong> asks you to approve task "<em>${escHtml(d.taskName)}</em>"`;
      case 'task_approval_response': return `<strong>@${escHtml(d.fromUsername)}</strong> ${d.accepted ? 'approved ✓' : 'rejected ✕'} your task "<em>${escHtml(d.taskName)}</em>"`;
      case 'goal_proposal': return `<strong>@${escHtml(d.fromUsername)}</strong> proposed a goal: <strong>${d.targetPoints} pts</strong> / ${PERIOD_LABELS[d.period] || d.period}`;
      case 'goal_response': return `<strong>@${escHtml(d.fromUsername)}</strong> ${d.accepted ? 'accepted ✓' : 'declined ✕'} your goal proposal`;
      default: return 'New notification';
    }
  }

  function openProposeModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    let selectedPeriod = '1w';

    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">Propose Goal</span>
          <button class="modal-close" id="close-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Friend</label>
            <select class="form-input" id="goal-friend">
              ${friendships.map(f => `<option value="${f.id}:${f.otherUser?.id}">${f.otherUser?.username}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Target Points</label>
            <input class="form-input" id="goal-pts" type="number" min="1" placeholder="e.g. 100">
          </div>
          <div class="form-group">
            <label class="form-label">Period</label>
            <div class="period-select" id="period-select">
              ${Object.entries(PERIOD_LABELS).map(([v, l]) => `<button class="period-btn ${v === '1w' ? 'active' : ''}" data-period="${v}">${l}</button>`).join('')}
            </div>
          </div>
          <div id="modal-error" class="form-error" style="margin-bottom:12px"></div>
          <button class="btn btn-primary btn-full" id="propose-btn">Send Proposal</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPeriod = btn.dataset.period;
        modal.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === selectedPeriod));
      });
    });

    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#propose-btn').addEventListener('click', async () => {
      const [friendshipId] = modal.querySelector('#goal-friend').value.split(':');
      const targetPoints = parseInt(modal.querySelector('#goal-pts').value);
      const errEl = modal.querySelector('#modal-error');
      errEl.textContent = '';
      if (!targetPoints || targetPoints < 1) { errEl.textContent = 'Enter valid target points'; return; }
      const btn = modal.querySelector('#propose-btn');
      btn.disabled = true;
      try {
        await api.goals.propose({ friendshipId, targetPoints, period: selectedPeriod });
        modal.remove();
        load();
        showToast('Goal proposal sent!');
      } catch (e) {
        errEl.textContent = e.message;
        btn.disabled = false;
      }
    });
  }

  async function respondApproval(approvalId, accept) {
    try {
      await api.tasks.approveRespond(approvalId, accept);
      pendingApprovals = pendingApprovals.filter(a => a.id !== approvalId);
      renderPage();
      showToast(accept ? 'Task approved!' : 'Task rejected');
    } catch (e) {
      showToast(e.message);
    }
  }

  async function respondGoal(goalId, accept) {
    try {
      await api.goals.respond(goalId, accept);
      load();
      showToast(accept ? 'Goal accepted! Check scoreboard.' : 'Goal declined');
    } catch (e) {
      showToast(e.message);
    }
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  load();
}

function loadingHTML() {
  return '<div style="display:flex;align-items:center;justify-content:center;padding:64px"><div class="spinner"></div></div>';
}
