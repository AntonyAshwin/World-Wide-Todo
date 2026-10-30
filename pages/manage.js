import { api } from '../js/api.js';
import { showToast } from '../app.js';
import { icons } from '../js/icons.js';

const DAYS = ['S','M','T','W','T','F','S'];

export function render(container) {
  let tasks = [];
  let friends = [];
  let selectedIds = new Set();

  async function load() {
    container.innerHTML = loadingHTML();
    try {
      const [td, fd] = await Promise.all([api.tasks.list(), api.friends.list()]);
      tasks = td.tasks;
      friends = fd.friendships.filter(f => f.status === 'accepted');
      renderPage();
    } catch (e) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">${icons.alertTriangle()}</div><div class="empty-text">${e.message}</div></div>`;
    }
  }

  function renderPage() {
    container.innerHTML = `
      <div class="section-header" style="padding-top:16px">
        <span class="section-title">My Tasks (${tasks.length})</span>
      </div>
      <div id="manage-list"></div>
      ${tasks.length === 0 ? `<div class="empty"><div class="empty-icon">${icons.clipboardList()}</div><div class="empty-text">No tasks yet</div></div>` : ''}
      <div style="height:96px"></div>
    `;

    // FAB row: [lock] [+]
    const fabRow = document.createElement('div');
    fabRow.id = 'fab-row';
    fabRow.style.cssText = 'position:fixed;bottom:80px;right:16px;display:flex;gap:10px;align-items:center;z-index:100;';

    if (friends.length > 0 && tasks.some(t => t.approvalStatus === 'none')) {
      const approveBtn = document.createElement('button');
      approveBtn.id = 'approve-fab';
      approveBtn.style.cssText = 'width:52px;height:52px;border-radius:50%;background:var(--surface);border:1.5px solid var(--border);color:var(--text2);font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);opacity:0.4;pointer-events:none;transition:opacity .15s,border-color .15s;';
      approveBtn.innerHTML = icons.lock();
      approveBtn.addEventListener('click', openMultiApprovalModal);
      fabRow.appendChild(approveBtn);
    }

    const fab = document.createElement('button');
    fab.style.cssText = 'width:52px;height:52px;border-radius:50%;background:var(--primary);color:#fff;font-size:28px;font-weight:300;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);line-height:1;';
    fab.id = 'manage-fab';
    fab.innerHTML = '+';
    fab.addEventListener('click', () => openTaskModal(null));
    fabRow.appendChild(fab);

    container.appendChild(fabRow);
    renderList();
  }

  function updateApproveBtn() {
    const btn = document.getElementById('approve-fab');
    if (!btn) return;
    const n = selectedIds.size;
    if (n > 0) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.borderColor = 'var(--primary)';
      btn.style.color = 'var(--primary)';
    } else {
      btn.style.opacity = '0.4';
      btn.style.pointerEvents = 'none';
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--text2)';
    }
  }

  function toggleSelect(taskId) {
    if (selectedIds.has(taskId)) selectedIds.delete(taskId);
    else selectedIds.add(taskId);
    updateApproveBtn();

    const el = container.querySelector(`.manage-item[data-selectable="${taskId}"]`);
    if (el) {
      el.classList.toggle('selected', selectedIds.has(taskId));
      const check = el.querySelector('.task-checkbox');
      if (check) {
        const checked = selectedIds.has(taskId);
        check.style.borderColor = checked ? 'var(--primary)' : 'var(--border)';
        check.style.background = checked ? 'var(--primary)' : 'transparent';
        check.innerHTML = checked ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : '';
      }
    }
  }

  function renderList() {
    const list = container.querySelector('#manage-list');
    if (!list) return;
    list.innerHTML = tasks.map(t => taskHTML(t)).join('');

    list.querySelectorAll('[data-selectable]').forEach(el => {
      if (el.dataset.selectable) {
        el.addEventListener('click', e => {
          if (e.target.closest('[data-edit],[data-delete],[data-unapprove]')) return;
          toggleSelect(el.dataset.selectable);
        });
      }
    });
    list.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openTaskModal(tasks.find(t => t.id === btn.dataset.edit)); }));
    list.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); confirmDelete(btn.dataset.delete); }));
    list.querySelectorAll('[data-unapprove]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); confirmUnapprove(btn.dataset.unapprove); }));
  }

  function taskHTML(t) {
    const dayStr = t.days && t.days.length ? t.days.map(d => DAYS[d]).join(' ') : 'Today only';
    const statusPill = t.approvalStatus !== 'none' ? `<span class="pill pill-${t.approvalStatus === 'approved' ? 'approved' : 'pending'}">${t.approvalStatus}</span>` : '';
    const isApproved = t.approvalStatus === 'approved';
    const isSelectable = t.approvalStatus === 'none' && friends.length > 0;
    const isSelected = selectedIds.has(t.id);

    const checkboxHTML = isSelectable ? `
      <div class="task-checkbox" style="width:22px;height:22px;border-radius:6px;border:2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};background:${isSelected ? 'var(--primary)' : 'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:6px">
        ${isSelected ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </div>` : `<div style="width:22px;flex-shrink:0;margin-right:6px"></div>`;

    return `
      <div class="manage-item ${isSelected ? 'selected' : ''}" ${isSelectable ? `data-selectable="${t.id}"` : ''} style="cursor:${isSelectable ? 'pointer' : 'default'}">
        <div class="manage-item-row">
          ${checkboxHTML}
          <div class="points-circle">${t.points}</div>
          <div class="manage-item-info">
            <div class="manage-item-name">${escHtml(t.name)} ${statusPill}</div>
            <div class="manage-item-meta">${dayStr}</div>
          </div>
          <div class="manage-item-actions">
            ${isApproved ? `<button class="btn btn-sm btn-icon btn-outline" data-unapprove="${t.id}" title="Unlock">${icons.lockOpen()}</button>` : ''}
            <button class="btn btn-sm btn-icon btn-outline" data-edit="${t.id}" title="Edit">${icons.pencil()}</button>
            <button class="btn btn-sm btn-icon btn-danger" data-delete="${t.id}" title="Delete">${icons.trash()}</button>
          </div>
        </div>
      </div>
    `;
  }

  function openMultiApprovalModal() {
    const selectedTasks = tasks.filter(t => selectedIds.has(t.id));
    if (!selectedTasks.length) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">Request Approval (${selectedTasks.length})</span>
          <button class="modal-close" id="close-modal">${icons.x()}</button>
        </div>
        <div class="modal-body">
          <div style="background:var(--surface2);border-radius:8px;padding:10px;margin-bottom:16px;max-height:140px;overflow-y:auto">
            ${selectedTasks.map(t => `<div style="font-size:13px;padding:2px 0;color:var(--text2)">${escHtml(t.name)} <span style="color:var(--text3)">(${t.points}pts)</span></div>`).join('')}
          </div>
          <div class="form-group">
            <label class="form-label">Send to</label>
            <select class="form-input" id="approver-select">
              ${friends.map(f => `<option value="${f.otherUser?.id}">${f.otherUser?.username}</option>`).join('')}
            </select>
          </div>
          <div id="modal-error" class="form-error" style="margin-bottom:12px"></div>
          <button class="btn btn-primary btn-full" id="send-approval-btn">Send ${selectedTasks.length} Request${selectedTasks.length > 1 ? 's' : ''}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#send-approval-btn').addEventListener('click', async () => {
      const approverId = modal.querySelector('#approver-select').value;
      const btn = modal.querySelector('#send-approval-btn');
      const errEl = modal.querySelector('#modal-error');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const results = [];
        for (const t of selectedTasks) {
          try {
            await api.tasks.requestApproval(t.id, { approverId });
            results.push({ status: 'fulfilled', taskId: t.id });
          } catch (e) {
            results.push({ status: 'rejected', taskId: t.id });
          }
        }
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.length - succeeded;
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            const idx = tasks.findIndex(t => t.id === r.taskId);
            if (idx !== -1) tasks[idx].approvalStatus = 'pending';
          }
        });
        selectedIds.clear();
        modal.remove();
        renderList();
        updateApproveBtn();
        showToast(failed === 0 ? `${succeeded} approval request${succeeded > 1 ? 's' : ''} sent` : `${succeeded} sent, ${failed} failed`);
      } catch (e) {
        errEl.textContent = e.message;
        btn.disabled = false;
        btn.textContent = `Send ${selectedTasks.length} Request${selectedTasks.length > 1 ? 's' : ''}`;
      }
    });
  }

  function openTaskModal(task) {
    const isEdit = !!task;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const selectedDays = new Set(task ? task.days : []);

    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">${isEdit ? 'Edit Task' : 'New Task'}</span>
          <button class="modal-close" id="close-modal">${icons.x()}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Task Name</label>
            <input class="form-input" id="task-name" type="text" placeholder="e.g. Morning run" value="${task ? escHtml(task.name) : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Points (1–1000)</label>
            <input class="form-input" id="task-pts" type="number" min="1" max="1000" placeholder="10" value="${task ? task.points : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Recurring Days</label>
            <div class="day-picker" id="day-picker">
              ${DAYS.map((d, i) => `<button class="day-btn ${selectedDays.has(i) ? 'active' : ''}" data-day="${i}">${d}</button>`).join('')}
              <button class="btn btn-sm btn-outline" id="all-days-btn" style="border-radius:20px">All</button>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-top:6px">No days selected = today only (one-time)</div>
          </div>
          <div id="modal-error" class="form-error" style="margin-bottom:12px"></div>
          <button class="btn btn-primary btn-full" id="save-task-btn">${isEdit ? 'Save Changes' : 'Create Task'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('.day-btn[data-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.day);
        if (selectedDays.has(d)) selectedDays.delete(d); else selectedDays.add(d);
        btn.classList.toggle('active', selectedDays.has(d));
      });
    });

    modal.querySelector('#all-days-btn').addEventListener('click', () => {
      const allSelected = selectedDays.size === 7;
      if (allSelected) { selectedDays.clear(); } else { for (let i = 0; i < 7; i++) selectedDays.add(i); }
      modal.querySelectorAll('.day-btn[data-day]').forEach(btn => btn.classList.toggle('active', selectedDays.has(parseInt(btn.dataset.day))));
    });

    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#save-task-btn').addEventListener('click', async () => {
      const btn = modal.querySelector('#save-task-btn');
      const errEl = modal.querySelector('#modal-error');
      const name = modal.querySelector('#task-name').value.trim();
      const points = parseInt(modal.querySelector('#task-pts').value);
      errEl.textContent = '';

      if (!name) { errEl.textContent = 'Task name required'; return; }
      if (!points || points < 1 || points > 1000) { errEl.textContent = 'Points must be 1–1000'; return; }

      btn.disabled = true;
      try {
        const payload = { name, points, days: Array.from(selectedDays) };
        if (isEdit) {
          const res = await api.tasks.update(task.id, payload);
          const idx = tasks.findIndex(t => t.id === task.id);
          if (idx !== -1) tasks[idx] = res.task;
          modal.remove();
          renderList();
          showToast(res.wasApproved ? 'Task updated — approval reset, re-request to count in pair score' : 'Task updated');
        } else {
          const created = await api.tasks.create(payload);
          tasks.unshift(created.task);
          modal.remove();
          renderList();
          const empty = container.querySelector('.empty');
          if (empty) empty.remove();
          const header = container.querySelector('.section-title');
          if (header) header.textContent = `My Tasks (${tasks.length})`;
          showToast('Task created');
        }
      } catch (e) {
        errEl.textContent = e.message;
        btn.disabled = false;
      }
    });
  }

  async function confirmDelete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header"><span class="modal-title">Delete Task?</span></div>
        <div class="modal-body">
          <p style="color:var(--text2);margin-bottom:16px">Delete "<strong>${escHtml(task.name)}</strong>"? All accumulated points for this task will be removed.</p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-full" id="cancel-del">Cancel</button>
            <button class="btn btn-danger btn-full" id="confirm-del">Delete</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#cancel-del').addEventListener('click', () => modal.remove());
    modal.querySelector('#confirm-del').addEventListener('click', async () => {
      try {
        await api.tasks.delete(taskId);
        tasks = tasks.filter(t => t.id !== taskId);
        selectedIds.delete(taskId);
        modal.remove();
        renderList();
        updateApproveBtn();
        const header = container.querySelector('.section-title');
        if (header) header.textContent = `My Tasks (${tasks.length})`;
        showToast('Task deleted');
      } catch (e) {
        showToast(e.message);
        modal.remove();
      }
    });
  }

  async function confirmUnapprove(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header"><span class="modal-title">Remove from Pair Score?</span></div>
        <div class="modal-body">
          <p style="color:var(--text2);margin-bottom:16px">"<strong>${escHtml(task.name)}</strong>" will be unapproved. Past pair score points for this task will be removed.</p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-full" id="cancel-unapprove">Cancel</button>
            <button class="btn btn-danger btn-full" id="confirm-unapprove">Unlock</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#cancel-unapprove').addEventListener('click', () => modal.remove());
    modal.querySelector('#confirm-unapprove').addEventListener('click', async () => {
      try {
        const result = await api.tasks.unapprove(taskId);
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) tasks[idx] = result.task;
        modal.remove();
        renderList();
        showToast('Task unlocked — no longer counted in pair score');
      } catch (e) {
        showToast(e.message);
        modal.remove();
      }
    });
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return load();
}

function loadingHTML() {
  return '<div style="display:flex;align-items:center;justify-content:center;padding:64px"><div class="spinner"></div></div>';
}
