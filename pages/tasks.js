import { api } from '../js/api.js';
import { showToast } from '../app.js';
import { icons } from '../js/icons.js';

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
      container.innerHTML = `<div class="empty"><div class="empty-icon">${icons.alertTriangle()}</div><div class="empty-text">${e.message}</div></div>`;
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
      </div>
      <div class="daily-bar">
        <div class="daily-bar-top">
          <span class="daily-label" id="daily-label">${pct}%</span>
        </div>
        <div class="daily-track">
          <div class="daily-fill" id="daily-fill" style="width:${pct}%;background-color:${pctColor(pct)}"></div>
          <div class="daily-marker" style="left:75%"></div>
        </div>
      </div>
      <div id="task-list"></div>
      ${tasks.length === 0 ? `<div class="empty" style="padding-top:32px"><div class="empty-icon">${icons.clipboardList()}</div><div class="empty-text">No tasks for today</div></div>` : ''}
      <div style="height:96px"></div>
    `;

    renderTaskList();
    renderFab();
  }

  function renderFab() {
    let fab = document.getElementById('tasks-fab');
    if (fab) return;
    fab = document.createElement('button');
    fab.id = 'tasks-fab';
    fab.style.cssText = 'position:fixed;bottom:calc(64px + env(safe-area-inset-bottom, 0px) + 8px);right:16px;width:52px;height:52px;border-radius:50%;background:var(--primary);color:#fff;font-size:28px;font-weight:300;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);line-height:1;z-index:20;';
    fab.innerHTML = '+';
    fab.addEventListener('click', openAddModal);
    container.appendChild(fab);
  }

  function openAddModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">New Task</span>
          <button class="modal-close" id="close-modal">${icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Task Name</label>
            <input class="form-input" id="task-name" type="text" placeholder="e.g. Morning run" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Points (1–1000, default 1)</label>
            <input class="form-input" id="task-pts" type="number" min="1" max="1000" placeholder="1">
          </div>
          <div id="modal-error" class="form-error" style="margin-bottom:12px"></div>
          <button class="btn btn-primary btn-full" id="save-task-btn">Create Task</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#save-task-btn').addEventListener('click', async () => {
      const btn = modal.querySelector('#save-task-btn');
      const errEl = modal.querySelector('#modal-error');
      const name = modal.querySelector('#task-name').value.trim();
      const rawPts = modal.querySelector('#task-pts').value;
      const points = rawPts === '' ? 1 : parseInt(rawPts);
      errEl.textContent = '';

      if (!name) { errEl.textContent = 'Task name required'; return; }
      if (isNaN(points) || points < 1 || points > 1000) { errEl.textContent = 'Points must be 1–1000'; return; }

      btn.disabled = true;
      btn.textContent = 'Creating…';
      try {
        await api.tasks.create({ name, points, days: [] });
        modal.remove();
        const data = await api.tasks.today();
        tasks = data.tasks;
        todayStr = data.date;
        renderPage();
        showToast('Task created');
      } catch (e) {
        errEl.textContent = e.message;
        btn.disabled = false;
        btn.textContent = 'Create Task';
      }
    });
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

    // Optimistic update — flip immediately
    const wasCompleted = task.completedToday;
    task.completedToday = !wasCompleted;
    task.completedPoints = task.completedToday ? task.points : 0;
    updateProgressBar();
    renderTaskList();

    try {
      const result = await api.tasks.complete(taskId);
      // Reconcile with server values (points may differ if task was edited)
      task.completedToday = result.completed;
      task.completedPoints = result.completed ? result.points : 0;
      updateProgressBar();
      renderTaskList();
      showToast(result.completed ? `+${result.points} pts earned!` : 'Points removed');
    } catch (e) {
      // Roll back
      task.completedToday = wasCompleted;
      task.completedPoints = wasCompleted ? task.points : 0;
      updateProgressBar();
      renderTaskList();
      showToast(e.message);
    }
  }

  function pctColor(pct) {
    // 0% = hue 0 (red), 40% = hue 60 (yellow), 100% = hue 120 (green)
    const h = pct <= 40 ? pct * 1.5 : 60 + (pct - 40);
    return `hsl(${h}, 72%, 45%)`;
  }

  function updateProgressBar() {
    const earned = tasks.filter(t => t.completedToday).reduce((s, t) => s + t.completedPoints, 0);
    const pct = totalPossible > 0 ? Math.min(100, Math.round((earned / totalPossible) * 100)) : 0;
    const fillEl = container.querySelector('#daily-fill');
    const labelEl = container.querySelector('#daily-label');
    if (fillEl) { fillEl.style.width = `${pct}%`; fillEl.style.backgroundColor = pctColor(pct); }
    if (labelEl) labelEl.textContent = `${pct}%`;
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  load();
}

function loadingHTML() {
  return '<div style="display:flex;align-items:center;justify-content:center;padding:64px"><div class="spinner"></div></div>';
}
