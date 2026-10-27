import { state } from './state.js';
import { recurLabel } from './domain.js';
import { pushState } from './api.js';
import { render } from './render.js';
import { showConfirm } from './confirm.js';
import { openEditSheet } from './sheet.js';

export function renderTasks() {
  const el = document.getElementById("tasksContent");
  el.innerHTML = "";

  if (!state.tasks.length) {
    el.innerHTML = `<p class="empty">No tasks yet. Tap + on Today to add one.</p>`;
    return;
  }

  state.tasks.forEach(task => {
    const item = document.createElement("div");
    item.className = "tasks-item";
    item.innerHTML = `
      <div class="tasks-item-body">
        <div class="tasks-item-name"></div>
        <div class="tasks-item-meta"></div>
      </div>
      <div class="tasks-item-pts"></div>
      <div class="tasks-actions">
        <button class="tasks-btn edit" aria-label="Edit task">✎</button>
        <button class="tasks-btn del"  aria-label="Delete task">✕</button>
      </div>
    `;
    item.querySelector(".tasks-item-name").textContent = task.name;
    item.querySelector(".tasks-item-meta").textContent = recurLabel(task);
    item.querySelector(".tasks-item-pts").textContent  = `${Number(task.points) || 0} pts`;

    item.querySelector(".edit").addEventListener("click", () => openEditSheet(task));

    item.querySelector(".del").addEventListener("click", () => {
      showConfirm(`Delete "${task.name}" and remove all its points from history?`, () => {
        // wipe every history entry this task ever created
        for (const date in state.done) {
          delete state.done[date][task.id];
        }
        state.tasks = state.tasks.filter(t => t.id !== task.id);
        pushState();
        render();       // refresh today view
        renderTasks();  // refresh this view
      });
    });

    el.appendChild(item);
  });
}
