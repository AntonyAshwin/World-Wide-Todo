import { icons } from './icons.js';

const routes = {
  '/': () => import('../pages/auth.js'),
  '/tasks': () => import('../pages/tasks.js'),
  '/manage': () => import('../pages/manage.js'),
  '/friends': () => import('../pages/friends.js'),
  '/scoreboard': () => import('../pages/scoreboard.js'),
  '/proposals': () => import('../pages/proposals.js'),
};

let currentCleanup = null;
let initialized = false;

export function navigate(path) {
  history.pushState(null, '', path);
  renderPage(path);
}

export function initRouter() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('popstate', () => renderPage(location.pathname));
}

export function renderCurrentPage() {
  renderPage(location.pathname);
}

async function renderPage(path) {
  const el = document.getElementById('page-root');
  if (!el) return;

  const loader = routes[path] || routes['/'];
  if (currentCleanup) { try { currentCleanup(); } catch(e) {} currentCleanup = null; }

  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:48px"><div class="spinner"></div></div>';
  try {
    const mod = await loader();
    el.innerHTML = '';
    currentCleanup = mod.render(el) || null;
  } catch (e) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${icons.alertTriangle()}</div><div class="empty-text">Failed to load page</div></div>`;
  }
}
