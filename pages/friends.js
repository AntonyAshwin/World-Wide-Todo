import { api } from '../js/api.js';
import { showToast } from '../app.js';

export function render(container) {
  let friendships = [];

  async function load() {
    container.innerHTML = loadingHTML();
    try {
      const data = await api.friends.list();
      friendships = data.friendships;
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
      ${accepted.length ? `<div class="card" style="padding:0 16px" id="friend-list">${accepted.map(friendHTML).join('')}</div>`
        : `<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">No friends yet</div><div class="empty-sub">Add friends by username</div></div>`}
      <div style="height:24px"></div>
    `;

    container.querySelector('#add-friend-btn').addEventListener('click', addFriend);
    container.querySelector('#add-friend-input').addEventListener('keydown', e => { if (e.key === 'Enter') addFriend(); });

    container.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => respond(btn.dataset.accept, true)));
    container.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => respond(btn.dataset.reject, false)));
  }

  function friendHTML(f) {
    const u = f.otherUser;
    if (!u) return '';
    return `
      <div class="friend-item">
        <div class="friend-avatar">${u.username[0].toUpperCase()}</div>
        <div>
          <div class="friend-name">@${escHtml(u.username)}</div>
          <div class="friend-status">Friend</div>
        </div>
      </div>
    `;
  }

  function pendingHTML(f) {
    const u = f.otherUser;
    if (!u) return '';
    const isIncoming = f.receiverId !== undefined;
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
