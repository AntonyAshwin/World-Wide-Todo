import { api, setToken } from './js/api.js';
import { state, setState, on } from './js/state.js';
import { navigate, initRouter, renderCurrentPage } from './js/router.js';

const TOKEN_KEY = 'tb_token';
const USER_KEY = 'tb_user';

const NAV = [
  { path: '/friends', icon: iconFriends(), label: 'Friends' },
  { path: '/manage', icon: iconManage(), label: 'Tasks' },
  { path: '/tasks', icon: iconToday(), label: 'Today' },
  { path: '/scoreboard', icon: iconScore(), label: 'Score' },
  { path: '/proposals', icon: iconBell(), label: 'Activity', badge: true },
];

const VALID_PATHS = NAV.map(n => n.path);

function iconToday() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>`; }
function iconManage() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`; }
function iconFriends() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function iconScore() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`; }
function iconBell() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`; }

export function showToast(msg, duration = 2200) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function buildShell(user) {
  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div></div>
        <div class="header-right">
          <span id="username-btn" style="font-size:13px;color:var(--text2);font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent">@${user.username}</span>
        </div>
      </header>
      <main class="page-content" id="page-root"></main>
      <nav class="bottom-nav" id="bottom-nav"></nav>
    </div>
  `;

  const nav = document.getElementById('bottom-nav');
  NAV.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.path = item.path;
    btn.innerHTML = `${item.icon}<span>${item.label}</span>${item.badge ? '<span class="nav-badge" id="notif-badge" style="display:none">0</span>' : ''}`;
    btn.addEventListener('click', () => {
      navigate(item.path);
      updateNavActive(item.path);
    });
    nav.appendChild(btn);
  });

  initRouter();

  document.getElementById('username-btn').addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header"><span class="modal-title">@${user.username}</span></div>
        <div class="modal-body">
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-full" id="cancel-logout">Cancel</button>
            <button class="btn btn-danger btn-full" id="confirm-logout">Log Out</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#cancel-logout').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#confirm-logout').addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      modal.remove();
      setState({ user: null });
      document.getElementById('app').innerHTML = '<div id="page-root"></div>';
      initRouter();
      navigate('/');
    });
  });

  on('unreadCount', (count) => {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent = count > 99 ? '99+' : count;
  });
}

function updateNavActive(path) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.path === path);
  });
}

async function pollNotifications() {
  try {
    const data = await api.notifications.list();
    const unread = data.notifications.filter(n => !n.read).length;
    setState({ unreadCount: unread });
  } catch (e) {}
  setTimeout(pollNotifications, 30000);
}

export function handleLoginSuccess(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  setToken(token);
  setState({ user });
  buildShell(user);
  navigate('/tasks');
  updateNavActive('/tasks');
  pollNotifications();
}

async function init() {
  const token = localStorage.getItem(TOKEN_KEY);

  if (token) {
    try {
      setToken(token);
      const data = await api.auth.me();
      setState({ user: data.user });
      buildShell(data.user);
      const dest = VALID_PATHS.includes(location.pathname) ? location.pathname : '/tasks';
      navigate(dest);
      updateNavActive(dest);
      pollNotifications();
      return;
    } catch (e) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
    }
  }

  // Not authenticated — auth page
  document.getElementById('app').innerHTML = '<div id="page-root"></div>';
  initRouter();
  navigate('/');
}

init();
