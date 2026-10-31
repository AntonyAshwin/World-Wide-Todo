import { api } from '../js/api.js';
import { showToast, logout } from '../app.js';
import { icons } from '../js/icons.js';

const PERIOD_LABELS = { '1w': '1 Week', '2w': '2 Weeks', '3w': '3 Weeks', '1m': '1 Month' };

export function render(container) {
  let pendingApprovals = [];
  let notifications = [];

  async function load() {
    container.innerHTML = loadingHTML();
    try {
      const [apd, nd] = await Promise.all([
        api.tasks.pendingApprovals(),
        api.notifications.list(),
      ]);
      pendingApprovals = apd.approvals;
      notifications = nd.notifications;
      await api.notifications.markRead();
      renderPage();
    } catch (e) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">${icons.alertTriangle()}</div><div class="empty-text">${e.message}</div></div>`;
    }
  }

  function renderPage() {
    container.innerHTML = `
      <div style="padding-top:8px">
        ${pendingApprovals.length ? `
          <div class="section-header"><span class="section-title">Awaiting Your Approval (${pendingApprovals.length})</span></div>
          <div id="approvals-list">${pendingApprovals.map(approvalHTML).join('')}</div>
        ` : ''}

        ${notifications.length ? `
          <div class="section-header" style="margin-top:8px"><span class="section-title">Recent Activity</span></div>
          <div class="card" style="padding:0">
            ${notifications.slice(0, 20).map(notifHTML).join('')}
          </div>
        ` : (!pendingApprovals.length ? `<div class="empty"><div class="empty-icon">${icons.bell()}</div><div class="empty-text">No activity yet</div></div>` : '')}

        <div style="height:24px"></div>
        <div style="padding:0 16px 8px">
          <button class="btn btn-outline btn-full" id="signout-btn" style="color:var(--danger);border-color:var(--danger)">Sign Out</button>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-approve-task]').forEach(btn =>
      btn.addEventListener('click', () => respondApproval(btn.dataset.approveTask, true)));
    container.querySelectorAll('[data-reject-task]').forEach(btn =>
      btn.addEventListener('click', () => respondApproval(btn.dataset.rejectTask, false)));
    container.querySelector('#signout-btn').addEventListener('click', logout);
  }

  function approvalHTML(a) {
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const daysStr = a.pendingDays && a.pendingDays.length ? a.pendingDays.map(d => dayNames[d]).join(', ') : 'Today only';
    return `
      <div class="card">
        <div style="font-size:13px;color:var(--text2);margin-bottom:4px">${a.type === 'edit' ? 'Edit request' : 'New task'} from ${a.ownerUsername ? `<strong>@${escHtml(a.ownerUsername)}</strong>` : 'someone'}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:2px">${escHtml(a.pendingName)}</div>
        <div style="font-size:13px;color:var(--text3)">${a.pendingPoints} pts · ${daysStr}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-outline btn-full btn-sm" data-reject-task="${a.id}">Reject</button>
          <button class="btn btn-success btn-full btn-sm" data-approve-task="${a.id}">Approve</button>
        </div>
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
      case 'task_approval_response': return `<strong>@${escHtml(d.fromUsername)}</strong> ${d.accepted ? 'approved' : 'rejected'} your task "<em>${escHtml(d.taskName)}</em>"`;
      case 'goal_proposal': return `<strong>@${escHtml(d.fromUsername)}</strong> proposed a goal: <strong>${d.targetPoints} pts</strong> / ${PERIOD_LABELS[d.period] || d.period} — go to Friends to respond`;
      case 'goal_response': return `<strong>@${escHtml(d.fromUsername)}</strong> ${d.accepted ? 'accepted' : 'declined'} your goal proposal`;
      default: return 'New notification';
    }
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

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  load();
}

function loadingHTML() {
  return '<div style="display:flex;align-items:center;justify-content:center;padding:64px"><div class="spinner"></div></div>';
}
