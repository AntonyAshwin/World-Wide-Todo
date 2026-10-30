import { api } from '../js/api.js';
import { showToast } from '../app.js';
import { state } from '../js/state.js';

const PERIOD_LABELS = { '1w': '1 Week', '2w': '2 Weeks', '3w': '3 Weeks', '1m': '1 Month' };

export function render(container) {
  let friendships = [];
  let goalsData = [];

  async function load() {
    container.innerHTML = loadingHTML();
    try {
      const [fd, gd] = await Promise.all([api.friends.list(), api.goals.list()]);
      friendships = fd.friendships;
      goalsData = gd.goals;
      renderPage();
    } catch (e) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">${e.message}</div></div>`;
    }
  }

  function renderPage() {
    const accepted = friendships.filter(f => f.status === 'accepted');
    const pending = friendships.filter(f => f.status === 'pending');

    container.innerHTML = `
      <div style="padding:16px 16px 0;display:flex;gap:8px">
        <input class="form-input" id="add-friend-input" type="text" placeholder="Search username to add" autocapitalize="none" style="flex:1">
        <button class="btn btn-primary" id="add-friend-btn">Add</button>
      </div>
      <div id="add-friend-error" class="form-error" style="padding:4px 16px 0"></div>

      ${pending.length ? `
        <div class="section-header" style="margin-top:16px"><span class="section-title">Pending (${pending.length})</span></div>
        <div class="card" style="padding:0 16px">
          ${pending.map(f => pendingHTML(f)).join('')}
        </div>
      ` : ''}

      <div class="section-header" style="margin-top:16px">
        <span class="section-title">Friends (${accepted.length})</span>
      </div>
      ${accepted.length
        ? `<div class="card" style="padding:0 16px" id="friend-list">${accepted.map(friendHTML).join('')}</div>`
        : `<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">No friends yet</div><div class="empty-sub">Add friends by username</div></div>`}
      <div style="height:24px"></div>
    `;

    container.querySelector('#add-friend-btn').addEventListener('click', addFriend);
    container.querySelector('#add-friend-input').addEventListener('keydown', e => { if (e.key === 'Enter') addFriend(); });

    container.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => respond(btn.dataset.accept, true)));
    container.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => respond(btn.dataset.reject, false)));

    container.querySelectorAll('[data-open-profile]').forEach(el =>
      el.addEventListener('click', () => {
        const f = accepted.find(f => f.id === el.dataset.openProfile);
        if (f) openProfile(f);
      })
    );
  }

  function friendHTML(f) {
    const u = f.otherUser;
    if (!u) return '';
    const gd = goalsData.find(g => g.friendshipId === f.id);
    const hasPending = gd && gd.pendingProposals.length > 0;
    return `
      <div class="friend-item" data-open-profile="${f.id}" style="cursor:pointer">
        <div class="friend-avatar">${u.username[0].toUpperCase()}</div>
        <div style="flex:1">
          <div class="friend-name">@${escHtml(u.username)}</div>
          <div class="friend-status">${gd && gd.activeGoal ? `Goal: ${gd.activeGoal.targetPoints} pts` : 'No active goal'}${hasPending ? ' · <span style="color:var(--primary)">proposal pending</span>' : ''}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;
  }

  function pendingHTML(f) {
    const u = f.otherUser;
    if (!u) return '';
    return `
      <div class="friend-item">
        <div class="friend-avatar">${u.username[0].toUpperCase()}</div>
        <div style="flex:1">
          <div class="friend-name">@${escHtml(u.username)}</div>
          <div class="friend-status">${f.requesterId ? 'Request sent' : 'Wants to connect'}</div>
        </div>
        <div class="friend-actions">
          <button class="btn btn-sm btn-success" data-accept="${f.id}">✓</button>
          <button class="btn btn-sm btn-danger" data-reject="${f.id}">✕</button>
        </div>
      </div>
    `;
  }

  function openProfile(friendship) {
    const u = friendship.otherUser;
    const gd = goalsData.find(g => g.friendshipId === friendship.id);
    const myId = state.user?.id;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    const activeGoalHTML = gd && gd.activeGoal
      ? `<div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:12px">
           <div style="font-size:12px;color:var(--text3);margin-bottom:2px">Active Goal</div>
           <div style="font-size:16px;font-weight:700">${gd.activeGoal.targetPoints} pts <span style="font-size:13px;font-weight:400;color:var(--text2)">/ ${PERIOD_LABELS[gd.activeGoal.period]}</span></div>
         </div>`
      : `<div style="font-size:13px;color:var(--text3);margin-bottom:12px">No active goal</div>`;

    const pendingHTML = gd && gd.pendingProposals.length
      ? gd.pendingProposals.map(p => {
          const isMyProposal = p.proposerId === myId;
          return `
            <div style="background:var(--primary-light);border-radius:8px;padding:10px;margin-bottom:10px">
              <div style="font-size:12px;font-weight:600;color:var(--primary);margin-bottom:4px">${isMyProposal ? 'Your proposal' : 'Proposed to you'}</div>
              <div style="font-size:14px"><strong>${p.targetPoints} pts</strong> / ${PERIOD_LABELS[p.period]}</div>
              ${!isMyProposal ? `
                <div style="display:flex;gap:8px;margin-top:8px">
                  <button class="btn btn-outline btn-sm btn-full" data-decline-goal="${p.id}">Decline</button>
                  <button class="btn btn-primary btn-sm btn-full" data-accept-goal="${p.id}">Accept</button>
                </div>` : `<div style="font-size:11px;color:var(--text3);margin-top:4px">Waiting for response…</div>`}
            </div>`;
        }).join('')
      : '';

    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">@${escHtml(u.username)}</span>
          <button class="modal-close" id="close-modal">✕</button>
        </div>
        <div class="modal-body">
          ${activeGoalHTML}
          ${pendingHTML}
          <button class="btn btn-primary btn-full" id="propose-goal-btn">Propose New Goal</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll('[data-accept-goal]').forEach(btn =>
      btn.addEventListener('click', async () => {
        await respondGoal(btn.dataset.acceptGoal, true, modal, friendship);
      })
    );
    modal.querySelectorAll('[data-decline-goal]').forEach(btn =>
      btn.addEventListener('click', async () => {
        await respondGoal(btn.dataset.declineGoal, false, modal, friendship);
      })
    );

    modal.querySelector('#propose-goal-btn').addEventListener('click', () => {
      modal.remove();
      openProposeModal(friendship);
    });
  }

  function openProposeModal(friendship) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    let selectedPeriod = '1w';

    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">Propose Goal vs @${escHtml(friendship.otherUser?.username)}</span>
          <button class="modal-close" id="close-modal">✕</button>
        </div>
        <div class="modal-body">
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
      const targetPoints = parseInt(modal.querySelector('#goal-pts').value);
      const errEl = modal.querySelector('#modal-error');
      errEl.textContent = '';
      if (!targetPoints || targetPoints < 1) { errEl.textContent = 'Enter valid target points'; return; }
      const btn = modal.querySelector('#propose-btn');
      btn.disabled = true;
      try {
        await api.goals.propose({ friendshipId: friendship.id, targetPoints, period: selectedPeriod });
        modal.remove();
        load();
        showToast('Goal proposal sent!');
      } catch (e) {
        errEl.textContent = e.message;
        btn.disabled = false;
      }
    });
  }

  async function respondGoal(goalId, accept, modal, friendship) {
    try {
      await api.goals.respond(goalId, accept);
      modal.remove();
      load();
      showToast(accept ? 'Goal accepted! Check scoreboard.' : 'Goal declined');
    } catch (e) {
      showToast(e.message);
    }
  }

  async function addFriend() {
    const input = container.querySelector('#add-friend-input');
    const errEl = container.querySelector('#add-friend-error');
    const username = input.value.trim();
    errEl.textContent = '';
    if (!username) return;
    const btn = container.querySelector('#add-friend-btn');
    btn.disabled = true;
    try {
      const data = await api.friends.request(username);
      friendships.unshift(data.friendship);
      input.value = '';
      renderPage();
      showToast(`Friend request sent to @${username}`);
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function respond(friendshipId, accept) {
    try {
      await api.friends.respond(friendshipId, accept);
      const idx = friendships.findIndex(f => f.id === friendshipId);
      if (idx !== -1) friendships[idx].status = accept ? 'accepted' : 'rejected';
      if (!accept) friendships = friendships.filter(f => f.id !== friendshipId);
      renderPage();
      showToast(accept ? 'Friend accepted!' : 'Request declined');
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
