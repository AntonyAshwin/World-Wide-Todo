import { state } from './state.js';
import { TODAY } from './date.js';
import { renderTasks } from './tasks-view.js';

const nav      = document.getElementById("sideNav");
const backdrop = document.getElementById("navBackdrop");

function openNav() {
  nav.classList.add("open");
  backdrop.classList.remove("hidden");
}

function closeNav() {
  nav.classList.remove("open");
  backdrop.classList.add("hidden");
}

const VIEWS  = ["today", "history", "tasks", "stats"];
const TITLES = { today: "Today", history: "History", tasks: "Tasks", stats: "Stats" };

export function switchView(id) {
  VIEWS.forEach(v => document.getElementById(`view-${v}`).classList.toggle("hidden", v !== id));
  document.querySelectorAll(".nav-item").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.view === id)
  );
  document.getElementById("title").textContent = TITLES[id] || "myBoard";
  document.body.dataset.view = id;
  if (id === "history") renderHistory();
  if (id === "tasks")   renderTasks();
  if (id === "stats")   renderStats();
  closeNav();
}

function renderHistory() {
  const el   = document.getElementById("historyContent");
  const days = Object.keys(state.done).sort().reverse();
  if (!days.length) { el.innerHTML = `<p class="empty">No history yet.</p>`; return; }

  el.innerHTML = "";
  days.forEach(date => {
    const dayDone = state.done[date];
    let earned = 0;
    const lines = Object.entries(dayDone).map(([id, pts]) => {
      const task = state.tasks.find(t => t.id === id);
      const name = task ? task.name : "(deleted)";
      const p    = typeof pts === "number" ? pts : 0;
      earned += p;
      return `<div class="history-task">✓ ${name}<span>${p} pts</span></div>`;
    });

    const div = document.createElement("div");
    div.className = "history-day";
    div.innerHTML = `
      <div class="history-date">${date}${date === TODAY ? " — Today" : ""}</div>
      ${lines.join("")}
      <div class="history-total">${earned} pts earned</div>
    `;
    el.appendChild(div);
  });
}

function renderStats() {
  const el   = document.getElementById("statsContent");
  const days = Object.keys(state.done);
  let lifetime = 0, bestDay = 0, bestDate = "";

  days.forEach(date => {
    let dayTotal = 0;
    for (const id in state.done[date]) {
      const v = state.done[date][id];
      if (typeof v === "number") { lifetime += v; dayTotal += v; }
    }
    if (dayTotal > bestDay) { bestDay = dayTotal; bestDate = date; }
  });

  el.innerHTML = `<div class="stats-grid">
    <div class="stat-card"><div class="stat-val">⭐ ${lifetime}</div><div class="stat-label">Lifetime pts</div></div>
    <div class="stat-card"><div class="stat-val">📅 ${days.length}</div><div class="stat-label">Days active</div></div>
    <div class="stat-card"><div class="stat-val">🏆 ${bestDay}</div><div class="stat-label">Best day${bestDate ? `<br><small>${bestDate}</small>` : ""}</div></div>
    <div class="stat-card"><div class="stat-val">📝 ${state.tasks.length}</div><div class="stat-label">Total tasks</div></div>
  </div>`;
}

document.getElementById("menuBtn").addEventListener("click", openNav);
backdrop.addEventListener("click", closeNav);
document.querySelectorAll(".nav-item").forEach(btn =>
  btn.addEventListener("click", () => switchView(btn.dataset.view))
);
