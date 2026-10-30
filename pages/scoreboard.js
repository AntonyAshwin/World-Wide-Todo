import { api } from '../js/api.js';
import { state } from '../js/state.js';

const PERIOD_LABELS = { '1w': '1 Week', '2w': '2 Weeks', '3w': '3 Weeks', '1m': '1 Month' };

export function render(container) {
  async function load() {
    container.innerHTML = loadingHTML();
    try {
      const data = await api.scoreboard.get();
      renderPage(data.boards);
    } catch (e) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">${e.message}</div></div>`;
    }
  }

  function renderPage(boards) {
    if (!boards.length) {
      container.innerHTML = `<div class="empty" style="padding-top:64px"><div class="empty-icon">🏆</div><div class="empty-text">No scoreboard yet</div><div class="empty-sub">Add friends and set a goal to compete</div></div>`;
      return;
    }

    container.innerHTML = `
      <div style="padding:16px 0">
        ${boards.map(b => boardHTML(b)).join('')}
      </div>
      <div style="height:24px"></div>
    `;
  }

  function boardHTML(b) {
    const me = state.user;
    if (!b.hasGoal) {
      return `
        <div class="card score-card">
          <div class="score-names">
            <span>You</span>
            <span class="score-vs">vs</span>
            <span>${escHtml(b.friend.username)}</span>
          </div>
          <div style="text-align:center;color:var(--text3);font-size:13px;padding:8px 0">
            No goal set yet — go to Friends to propose one
          </div>
        </div>
      `;
    }

    const myPct = b.me.pct;
    const theirPct = b.them.pct;
    const endDate = new Date(b.goal.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
      <div class="card score-card">
        <div class="score-names">
          <span style="color:var(--primary)">You ${myPct >= theirPct ? '👑' : ''}</span>
          <span class="score-vs">vs</span>
          <span style="color:var(--warning)">${escHtml(b.friend.username)} ${theirPct > myPct ? '👑' : ''}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px;text-align:center">
          Goal: <strong>${b.goal.targetPoints} pts</strong> · ${PERIOD_LABELS[b.goal.period]} · ends ${endDate}
        </div>
        <div class="progress-wrap progress-me">
          <div class="progress-label">
            <span style="color:var(--primary)">You — ${b.me.points} pts</span>
            <span style="color:var(--primary)">${myPct}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${myPct}%;background:var(--primary)"></div>
          </div>
        </div>
        <div class="progress-wrap progress-them" style="margin-top:10px">
          <div class="progress-label">
            <span style="color:var(--warning)">${escHtml(b.friend.username)} — ${b.them.points} pts</span>
            <span style="color:var(--warning)">${theirPct}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${theirPct}%;background:var(--warning)"></div>
          </div>
        </div>
      </div>
    `;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  load();
}

function loadingHTML() {
  return '<div style="display:flex;align-items:center;justify-content:center;padding:64px"><div class="spinner"></div></div>';
}
