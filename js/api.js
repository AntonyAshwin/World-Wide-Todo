import { state, updateState } from './state.js';
import { getUser } from './auth.js';

const API = "/api/state";
let saveTimer = null;

function apiUrl() { return `${API}?user=${encodeURIComponent(getUser())}`; }
function cacheKey() { return `Ashwin's TODO.cache.${getUser()}`; }

export function setSync(msg, err = false) {
  const el = document.getElementById("sync");
  el.textContent = msg;
  el.classList.toggle("err", err);
}

export function cache() {
  try { localStorage.setItem(cacheKey(), JSON.stringify(state)); } catch {}
}

export async function loadState(render) {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (raw) { const d = JSON.parse(raw); updateState(d.tasks || [], d.done || {}); }
  } catch {}
  render();

  try {
    const res  = await fetch(apiUrl());
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    updateState(data.tasks || [], data.done || {});
    cache();
    render();
    setSync("Synced ✓");
  } catch {
    setSync("Offline — using local copy", true);
  }
}

export async function pushState() {
  cache();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    setSync("Saving…");
    try {
      const res = await fetch(apiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error(res.status);
      setSync("Synced ✓");
    } catch {
      setSync("Save failed — will keep local copy", true);
    }
  }, 350);
}
