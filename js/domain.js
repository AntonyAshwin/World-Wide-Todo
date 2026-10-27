import { state } from './state.js';
import { TODAY, TODAY_WD, WD_SHORT } from './date.js';

export function dueToday(t) {
  if (t.recur) {
    if (t.recur === "daily")  return true;
    if (t.recur === "weekly") return (t.weekdays || []).includes(TODAY_WD);
    return t.date === TODAY;
  }
  if (t.recurring) return (t.weekdays || []).includes(TODAY_WD);
  return (t.dates || []).includes(TODAY);
}

export function isDone(id) {
  return !!(state.done[TODAY] && state.done[TODAY][id] != null);
}

export function lifetimePoints() {
  let sum = 0;
  for (const day in state.done)
    for (const id in state.done[day]) {
      const v = state.done[day][id];
      sum += typeof v === "number" ? v : 0;
    }
  return sum;
}

export function recurLabel(t) {
  if (t.recur) {
    if (t.recur === "daily")  return "Daily";
    if (t.recur === "weekly") return (t.weekdays || []).map(d => WD_SHORT[d]).join(" ");
    return "One-time";
  }
  const names = (t.weekdays || []).map(d => WD_SHORT[d]).join(" ");
  if (t.recurring) return (t.weekdays || []).length === 7 ? "Daily" : names;
  return (t.dates || []).length <= 1 ? "Once" : "Once: " + names;
}
