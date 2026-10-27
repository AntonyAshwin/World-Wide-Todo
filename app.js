// myBoard — daily task tracker. State lives in Netlify Blobs via /api/state.
// localStorage is used as an offline cache / fallback.

const API = "/api/state";
const CACHE_KEY = "myboard.cache";
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

// state shape:
// tasks: [{ id, name, points, recur:'none'|'daily'|'weekly', weekdays:[0-6], date:'YYYY-MM-DD' }]
// done:  { 'YYYY-MM-DD': { taskId: pointsAwarded } }  <- snapshot of points at completion
let state = { tasks: [], done: {} };
let saveTimer = null;

// ---- date helpers ----
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const TODAY = todayKey();
const TODAY_WD = new Date().getDay();

// ---- persistence ----
function cache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch {}
}

async function loadState() {
  // seed from cache for instant paint
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch {}
  render();

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    state = { tasks: data.tasks || [], done: data.done || {} };
    cache();
    render();
    setSync("Synced ✓");
  } catch (e) {
    setSync("Offline — using local copy", true);
  }
}

async function pushState() {
  cache();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    setSync("Saving…");
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error(res.status);
      setSync("Synced ✓");
    } catch (e) {
      setSync("Save failed — will keep local copy", true);
    }
  }, 350);
}

// ---- domain ----
function dueToday(t) {
  // legacy shape (recur string) — keep old tasks working
  if (t.recur) {
    if (t.recur === "daily") return true;
    if (t.recur === "weekly") return (t.weekdays || []).includes(TODAY_WD);
    return t.date === TODAY;
  }
  if (t.recurring) return (t.weekdays || []).includes(TODAY_WD);
  return (t.dates || []).includes(TODAY); // one-time, resolved dates
}

function isDone(id) {
  return !!(state.done[TODAY] && state.done[TODAY][id] != null);
}

function toggle(t) {
  if (!state.done[TODAY]) state.done[TODAY] = {};
  if (state.done[TODAY][t.id] != null) delete state.done[TODAY][t.id];
  else state.done[TODAY][t.id] = Number(t.points) || 0; // snapshot points earned
  pushState();
  render();
}

function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  pushState();
  render();
}

// lifetime points = sum of every awarded value across all days
function lifetimePoints() {
  let sum = 0;
  for (const day in state.done) {
    for (const id in state.done[day]) {
      const v = state.done[day][id];
      sum += typeof v === "number" ? v : 0;
    }
  }
  return sum;
}

function recurLabel(t) {
  if (t.recur) { // legacy
    if (t.recur === "daily") return "Daily";
    if (t.recur === "weekly") return (t.weekdays || []).map((d) => WD_SHORT[d]).join(" ");
    return "One-time";
  }
  const names = (t.weekdays || []).map((d) => WD_SHORT[d]).join(" ");
  if (t.recurring) return (t.weekdays || []).length === 7 ? "Daily" : names;
  return (t.dates || []).length <= 1 ? "Once" : "Once: " + names;
}

// ---- render ----
const els = {
  list: document.getElementById("taskList"),
  empty: document.getElementById("empty"),
  score: document.getElementById("score"),
  date: document.getElementById("date"),
  bar: document.getElementById("progressBar"),
  lifetime: document.getElementById("lifetime"),
  sync: document.getElementById("sync"),
};

function setSync(msg, err = false) {
  els.sync.textContent = msg;
  els.sync.classList.toggle("err", err);
}

function render() {
  const todays = state.tasks.filter(dueToday);
  els.list.innerHTML = "";

  let earned = 0, total = 0;
  todays.forEach((t) => {
    const pts = Number(t.points) || 0;
    total += pts;
    if (isDone(t.id)) earned += pts;
    els.list.appendChild(taskEl(t));
  });

  els.empty.classList.toggle("hidden", todays.length > 0);
  els.score.textContent = `${earned} / ${total}`;
  els.bar.style.width = total > 0 ? `${(earned / total) * 100}%` : "0%";
  els.lifetime.textContent = `⭐ ${lifetimePoints()} total`;
  els.date.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}

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
  li.querySelector(".badge").textContent = recurLabel(t);
  li.querySelector(".pts").textContent = `${Number(t.points) || 0} pts`;

  li.addEventListener("click", (e) => {
    if (e.target.closest(".del")) return;
    toggle(t);
  });
  li.querySelector(".del").addEventListener("click", (e) => {
    e.stopPropagation();
    showConfirm(`Delete "${t.name}"?`, () => removeTask(t.id));
  });
  return li;
}

// ---- custom confirm popup ----
const confirmPopup = document.getElementById("confirmPopup");
const confirmBackdrop = document.getElementById("confirmBackdrop");
const confirmText = document.getElementById("confirmText");
let confirmCb = null;

function showConfirm(msg, onYes) {
  confirmText.textContent = msg;
  confirmCb = onYes;
  confirmPopup.classList.remove("hidden");
  confirmBackdrop.classList.remove("hidden");
}
function hideConfirm() {
  confirmPopup.classList.add("hidden");
  confirmBackdrop.classList.add("hidden");
  confirmCb = null;
}
document.getElementById("confirmYes").addEventListener("click", () => {
  if (confirmCb) confirmCb();
  hideConfirm();
});
document.getElementById("confirmNo").addEventListener("click", hideConfirm);
confirmBackdrop.addEventListener("click", hideConfirm);

// ---- add-task sheet ----
const sheet = document.getElementById("sheet");
const backdrop = document.getElementById("sheetBackdrop");
const recurChk = document.getElementById("f-recur");
const wdPicker = document.getElementById("weekdayPicker");
let pickedDays = new Set();

WD_LETTER.forEach((label, i) => {
  const b = document.createElement("div");
  b.className = "wd";
  b.textContent = label;
  b.setAttribute("aria-label", WD_SHORT[i]);
  b.addEventListener("click", () => {
    if (pickedDays.has(i)) { pickedDays.delete(i); b.classList.remove("on"); }
    else { pickedDays.add(i); b.classList.add("on"); }
  });
  wdPicker.appendChild(b);
});

function openSheet() {
  document.getElementById("f-name").value = "";
  document.getElementById("f-points").value = "1";
  recurChk.checked = true;
  // preselect today
  pickedDays = new Set([TODAY_WD]);
  wdPicker.querySelectorAll(".wd").forEach((e, i) => e.classList.toggle("on", i === TODAY_WD));
  sheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  document.getElementById("f-name").focus();
}

function closeSheet() {
  sheet.classList.add("hidden");
  backdrop.classList.add("hidden");
}

// For a one-time task: map chosen weekdays to actual dates in the next 7 days.
function resolveDates(days) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (days.includes(d.getDay())) out.push(todayKey(d));
  }
  return out;
}

function addTask() {
  const name = document.getElementById("f-name").value.trim();
  if (!name) { alert("Give the task a name."); return; }
  const points = Math.max(0, parseInt(document.getElementById("f-points").value, 10) || 0);
  const days = [...pickedDays].sort((a, b) => a - b);
  if (days.length === 0) { alert("Pick at least one day."); return; }
  const recurring = recurChk.checked;

  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    points,
    recurring,
    weekdays: days,
  };
  if (!recurring) task.dates = resolveDates(days);

  state.tasks.push(task);
  pushState();
  closeSheet();
  render();
}

document.getElementById("addBtn").addEventListener("click", openSheet);
document.getElementById("cancelBtn").addEventListener("click", closeSheet);
document.getElementById("saveBtn").addEventListener("click", addTask);
backdrop.addEventListener("click", closeSheet);

loadState();
