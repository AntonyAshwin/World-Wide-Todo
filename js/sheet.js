import { state } from './state.js';
import { TODAY_WD, WD_LETTER, WD_SHORT, todayKey } from './date.js';
import { pushState } from './api.js';
import { render } from './render.js';

const sheet    = document.getElementById("sheet");
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
    else                   { pickedDays.add(i);    b.classList.add("on"); }
  });
  wdPicker.appendChild(b);
});

export function openSheet() {
  document.getElementById("f-name").value   = "";
  document.getElementById("f-points").value = "1";
  recurChk.checked = true;
  pickedDays = new Set([TODAY_WD]);
  wdPicker.querySelectorAll(".wd").forEach((e, i) => e.classList.toggle("on", i === TODAY_WD));
  sheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  document.getElementById("f-name").focus();
}

export function closeSheet() {
  sheet.classList.add("hidden");
  backdrop.classList.add("hidden");
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
  const points = Math.max(0, parseInt(document.getElementById("f-points").value, 10) || 0);
  const days   = [...pickedDays].sort((a, b) => a - b);
  if (days.length === 0) { alert("Pick at least one day."); return; }
  const recurring = recurChk.checked;

  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, points, recurring, weekdays: days,
  };
  if (!recurring) task.dates = resolveDates(days);

  state.tasks.push(task);
  pushState();
  closeSheet();
  render();
}
