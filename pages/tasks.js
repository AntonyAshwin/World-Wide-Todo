import { api } from '../js/api.js';
import { showToast } from '../app.js';
import { navigate } from '../js/router.js';

const DAYS = ['S','M','T','W','T','F','S'];

export function render(container) {
  let tasks = [];
  let todayStr = '';
  let totalPossible = 0;

  async function load() {
    container.innerHTML = loadingHTML();
    try {
      const data = await api.tasks.today();
      tasks = data.tasks;
      todayStr = data.date;
      renderPage();
    } catch (e) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">${e.message}</div></div>`;
    }
  }

  function renderPage() {
    const earned = tasks.filter(t => t.completedToday).reduce((s, t) => s + t.completedPoints, 0);
    totalPossible = tasks.reduce((s, t) => s + t.points, 0);
    const pct = totalPossible > 0 ? Math.min(100, Math.round((earned / totalPossible) * 100)) : 0;

    const dateLabel = new Date(todayStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    container.innerHTML = `
      <div class="section-header" style="padding-top:16px">
        <span style="font-size:15px;font-weight:700">${dateLabel}</span>
        <button class="btn btn-ghost btn-sm" id="add-task-btn">+ Add Task</button>
      </div>
      <div class="daily-bar">
        <div class="daily-bar-top">
          <span class="daily-points" id="daily-pts">${earned} pts</span>
          <span class="daily-label" id="daily-label">${pct}% of today</span>
        </div>
        <div class="daily-track"><div class="daily-fill" id="daily-fill" style="width:${pct}%"></div></div>
      </div>
      <div id="task-list"></div>
      ${tasks.length === 0 ? `<div class="empty" style="padding-top:32px"><div class="empty-icon">📋</div><div class="empty-text">No tasks for today</div><div class="empty-sub">Tap "+ Add Task" to create one</div></div>` : ''}
    `;

    renderTaskList();
    container.querySelector('#add-task-btn').addEventListener('click', () => navigate('/manage'));
  }

  function renderTaskList() {
    const list = container.querySelector('#task-list');
    if (!list) return;
    list.innerHTML = tasks.map(t => taskHTML(t)).join('');
    list.querySelectorAll('.task-item').forEach(el => {
      el.addEventListener('click', () => toggle(el.dataset.id));
    });
  }

  function taskHTML(t) {
    const doneClass = t.completedToday ? 'done' : '';
    const lockIcon = t.approvalStatus === 'approved' ? `<svg class="task-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` : '';
    const dayStr = t.days && t.days.length ? t.days.map(d => DAYS[d]).join('') : 'Today only';
    return `
      <div class="task-item ${doneClass}" data-id="${t.id}">
        <div class="task-check">
          <svg class="task-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="task-info">
          <div class="task-name">${escHtml(t.name)}</div>
          <div class="task-meta">${dayStr}</div>
        </div>
        ${lockIcon}
        <div class="task-points">${t.completedToday ? '+' : ''}${t.completedToday ? t.completedPoints : t.points}pts</div>
      </div>
    `;
  }

  async function toggle(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const el = container.querySelector(`.task-item[data-id="${taskId}"]`);
    if (el) el.style.opacity = '0.5';
    try {
      const result = await api.tasks.complete(taskId);
      task.completedToday = result.completed;
      task.completedPoints = result.completed ? result.points : 0;
      // Recalculate
      const earned = tasks.filter(t => t.completedToday).reduce((s, t) => s + t.completedPoints, 0);
      const pct = totalPossible > 0 ? Math.min(100, Math.round((earned / totalPossible) * 100)) : 0;
      const ptsEl = container.querySelector('#daily-pts');
      const fillEl = container.querySelector('#daily-fill');
      const labelEl = container.querySelector('#daily-label');
      if (ptsEl) ptsEl.textContent = `${earned} pts`;
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (labelEl) labelEl.textContent = `${pct}% of today`;
      renderTaskList();
      showToast(result.completed ? `+${result.points} pts earned!` : 'Points removed');
    } catch (e) {
      showToast(e.message);
      if (el) el.style.opacity = '1';
    }
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  load();
}

function loadingHTML() {
  return '<div style="display:flex;align-items:center;justify-content:center;padding:64px"><div class="spinner"></div></div>';
}
