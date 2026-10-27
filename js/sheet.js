import { state } from './state.js';
import { TODAY_WD, WD_LETTER, WD_SHORT, todayKey } from './date.js';
import { pushState } from './api.js';
import { render } from './render.js';

const sheet    = document.getElementById("sheet");
const backdrop = document.getElementById("sheetBackdrop");
const sheetH2  = document.querySelector("#sheet h2");
const saveBtn  = document.getElementById("saveBtn");
const recurChk = document.getElementById("f-recur");
const wdPicker = document.getElementById("weekdayPicker");
let pickedDays   = new Set();
let editingTask  = null;

WD_LETTER.forEach((label, i) => {
  const b = document.createElement("div");
  b.className = "wd";
  b.textContent = label;
  b.setAttribute("aria-label", WD_SHORT[i]);
  b.addEventListener("click", () => {
    if (pickedDays.has(i)) { pickedDays.delete(i); b.classList.remove("on"); }
    else                   { pickedDays.add(i);    b.classList.add("on"); }
  });
  wdPicker.appendChild(b);
});

function setWdPicker(days) {
  pickedDays = new Set(days);
  wdPicker.querySelectorAll(".wd").forEach((e, i) => e.classList.toggle("on", pickedDays.has(i)));
}

export function openSheet() {
  editingTask = null;
  document.getElementById("f-name").value   = "";
  document.getElementById("f-points").value = "1";
  recurChk.checked = true;
  setWdPicker([TODAY_WD]);
  sheetH2.textContent  = "New task";
  saveBtn.textContent  = "Add task";
  sheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  document.getElementById("f-name").focus();
}

export function openEditSheet(task) {
  editingTask = task;
  document.getElementById("f-name").value   = task.name;
  document.getElementById("f-points").value = task.points ?? 1;

  // normalise legacy `recur` field to new shape
  let recurring, weekdays;
  if (task.recur) {
    if (task.recur === "daily")  { recurring = true;  weekdays = [0,1,2,3,4,5,6]; }
    else if (task.recur === "weekly") { recurring = true;  weekdays = task.weekdays || []; }
    else                         { recurring = false; weekdays = task.weekdays || [TODAY_WD]; }
  } else {
    recurring = task.recurring ?? false;
    weekdays  = task.weekdays  || [];
  }

  recurChk.checked = recurring;
  setWdPicker(weekdays);
  sheetH2.textContent = "Edit task";
  saveBtn.textContent = "Save changes";
  sheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  document.getElementById("f-name").focus();
}

export function closeSheet() {
  sheet.classList.add("hidden");
  backdrop.classList.add("hidden");
  editingTask = null;
}

function resolveDates(days) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (days.includes(d.getDay())) out.push(todayKey(d));
  }
  return out;
}

export function addTask() {
  const name = document.getElementById("f-name").value.trim();
  if (!name) { alert("Give the task a name."); return; }
  const points    = Math.max(0, parseInt(document.getElementById("f-points").value, 10) || 0);
  const days      = [...pickedDays].sort((a, b) => a - b);
  if (days.length === 0) { alert("Pick at least one day."); return; }
  const recurring = recurChk.checked;

  if (editingTask) {
    editingTask.name      = name;
    editingTask.points    = points;
    editingTask.recurring = recurring;
    editingTask.weekdays  = days;
    // migrate off legacy recur field
    delete editingTask.recur;
    delete editingTask.date;
    if (recurring) delete editingTask.dates;
    else           editingTask.dates = resolveDates(days);
  } else {
    const task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, points, recurring, weekdays: days,
    };
    if (!recurring) task.dates = resolveDates(days);
    state.tasks.push(task);
  }

  pushState();
  closeSheet();
  render();
}
