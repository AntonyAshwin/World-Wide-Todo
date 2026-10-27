import { state } from './state.js';
import { TODAY } from './date.js';
import { dueToday, isDone, lifetimePoints, recurLabel } from './domain.js';
import { pushState } from './api.js';
import { showConfirm } from './confirm.js';

const els = {
  list:     document.getElementById("taskList"),
  empty:    document.getElementById("empty"),
  score:    document.getElementById("score"),
  date:     document.getElementById("date"),
  bar:      document.getElementById("progressBar"),
  lifetime: document.getElementById("lifetime"),
};

function taskEl(t) {
  const li = document.createElement("li");
  li.className = "task" + (isDone(t.id) ? " done" : "");
  li.innerHTML = `
    <div class="check">✓</div>
    <div class="task-body">
      <div class="task-name"></div>
      <div class="task-meta"><span class="badge"></span></div>
    </div>
    <div class="pts"></div>
    <button class="del" aria-label="Delete task">✕</button>
  `;
  li.querySelector(".task-name").textContent = t.name;
  li.querySelector(".badge").textContent     = recurLabel(t);
  li.querySelector(".pts").textContent       = `${Number(t.points) || 0} pts`;

  li.addEventListener("click", e => {
    if (e.target.closest(".del")) return;
    if (!state.done[TODAY]) state.done[TODAY] = {};
    if (state.done[TODAY][t.id] != null) delete state.done[TODAY][t.id];
    else state.done[TODAY][t.id] = Number(t.points) || 0;
    pushState();
    render();
  });

  li.querySelector(".del").addEventListener("click", e => {
    e.stopPropagation();
    showConfirm(`Delete "${t.name}"?`, () => {
      state.tasks = state.tasks.filter(x => x.id !== t.id);
      pushState();
      render();
    });
  });

  return li;
}

export function render() {
  const todays = state.tasks.filter(dueToday);
  els.list.innerHTML = "";
  let earned = 0, total = 0;
  todays.forEach(t => {
    const pts = Number(t.points) || 0;
    total += pts;
    if (isDone(t.id)) earned += pts;
    els.list.appendChild(taskEl(t));
  });
  els.empty.classList.toggle("hidden", todays.length > 0);
  els.score.textContent    = `${earned} / ${total}`;
  els.bar.style.width      = total > 0 ? `${(earned / total) * 100}%` : "0%";
  els.lifetime.textContent = `⭐ ${lifetimePoints()} total`;
  els.date.textContent     = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}
