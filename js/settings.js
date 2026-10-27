import { state } from './state.js';
import { pushState } from './api.js';
import { getUser, setUser } from './auth.js';

export const PALETTE = [
  "#f43f5e", "#ec4899", "#d946ef", "#a855f7", "#8b5cf6",
  "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6",
  "#10b981", "#22c55e", "#84cc16", "#eab308", "#f59e0b",
  "#f97316", "#ef4444", "#e11d48", "#7c3aed", "#0284c7",
];

export function ensureColor() {
  if (!state.color) {
    state.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    pushState();
  }
}

export function renderSettings() {
  const el   = document.getElementById("settingsContent");
  const user = getUser();

  el.innerHTML = `
    <div class="settings-section">
      <div class="settings-label">Your name</div>
      <div class="settings-name-row">
        <input id="s-name" class="settings-input" type="text"
               value="" autocomplete="off" spellcheck="false" />
        <button id="s-name-save" class="btn btn-primary">Save</button>
      </div>
      <p id="s-name-error" class="user-error hidden"></p>
    </div>

    <div class="settings-section">
      <div class="settings-label">Change password</div>
      <div class="pw-field">
        <input id="s-pw-cur" class="settings-input" type="password"
               placeholder="Current password" autocomplete="current-password" />
        <button class="pw-eye" type="button" data-target="s-pw-cur">👁</button>
      </div>
      <div class="pw-field" style="margin-top:10px">
        <input id="s-pw-new" class="settings-input" type="password"
               placeholder="New password" autocomplete="new-password" />
        <button class="pw-eye" type="button" data-target="s-pw-new">👁</button>
      </div>
      <div class="pw-field" style="margin-top:10px">
        <input id="s-pw-confirm" class="settings-input" type="password"
               placeholder="Confirm new password" autocomplete="new-password" />
        <button class="pw-eye" type="button" data-target="s-pw-confirm">👁</button>
      </div>
      <button id="s-pw-save" class="btn btn-primary" style="margin-top:12px;width:100%">Save password</button>
      <p id="s-pw-error" class="user-error hidden"></p>
      <p id="s-pw-ok" class="s-pw-ok hidden">Password updated.</p>
    </div>

    <div class="settings-section">
      <div class="settings-label">Your color</div>
      <div id="colorGrid" class="color-grid"></div>
    </div>
  `;

  el.querySelector("#s-name").value = user;

  // ---- color grid ----
  const grid = el.querySelector("#colorGrid");
  PALETTE.forEach(color => {
    const s = document.createElement("div");
    s.className = "color-swatch" + (color === state.color ? " selected" : "");
    s.style.setProperty("--c", color);
    s.addEventListener("click", () => {
      state.color = color;
      pushState();
      grid.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("selected"));
      s.classList.add("selected");
    });
    grid.appendChild(s);
  });

  // ---- name save ----
  const nameInput = el.querySelector("#s-name");
  const nameError = el.querySelector("#s-name-error");
  el.querySelector("#s-name-save").addEventListener("click", async () => {
    const newName = nameInput.value.trim();
    if (!newName || newName === user) return;
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", from: user, to: newName }),
      });
      if (!res.ok) throw new Error();
      setUser(newName);
      location.reload();
    } catch {
      nameError.textContent = "Rename failed. Try again.";
      nameError.classList.remove("hidden");
    }
  });
  nameInput.addEventListener("input", () => nameError.classList.add("hidden"));

  // ---- eye toggles ----
  el.querySelectorAll(".pw-eye").forEach(btn => {
    btn.addEventListener("click", () => {
      const inp = el.querySelector("#" + btn.dataset.target);
      inp.type  = inp.type === "password" ? "text" : "password";
    });
  });

  // ---- password save ----
  const pwError = el.querySelector("#s-pw-error");
  const pwOk    = el.querySelector("#s-pw-ok");
  el.querySelector("#s-pw-save").addEventListener("click", async () => {
    const cur     = el.querySelector("#s-pw-cur").value;
    const newPw   = el.querySelector("#s-pw-new").value;
    const confirm = el.querySelector("#s-pw-confirm").value;
    pwError.classList.add("hidden");
    pwOk.classList.add("hidden");

    if (!cur || !newPw || !confirm) {
      pwError.textContent = "Fill in all password fields.";
      pwError.classList.remove("hidden");
      return;
    }
    if (newPw !== confirm) {
      pwError.textContent = "New passwords don't match.";
      pwError.classList.remove("hidden");
      return;
    }
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "changePassword", name: user, oldPassword: cur, newPassword: newPw }),
      });
      if (res.status === 401) {
        pwError.textContent = "Current password is wrong.";
        pwError.classList.remove("hidden");
        return;
      }
      if (!res.ok) throw new Error();
      el.querySelector("#s-pw-cur").value     = "";
      el.querySelector("#s-pw-new").value     = "";
      el.querySelector("#s-pw-confirm").value = "";
      pwOk.classList.remove("hidden");
    } catch {
      pwError.textContent = "Save failed. Try again.";
      pwError.classList.remove("hidden");
    }
  });

  [el.querySelector("#s-pw-cur"), el.querySelector("#s-pw-new"), el.querySelector("#s-pw-confirm")]
    .forEach(inp => inp.addEventListener("input", () => {
      pwError.classList.add("hidden");
      pwOk.classList.add("hidden");
    }));
}
