const STORAGE_KEY = "Ashwin's TODO.user";

export function getUser() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setUser(name) {
  localStorage.setItem(STORAGE_KEY, name);
}

export function switchUser() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function post(body) {
  return fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function showPicker() {
  return new Promise(resolve => {
    const overlay = document.getElementById("userPicker");
    const list    = document.getElementById("userList");

    function wireEye(eyeId, inputId) {
      list.querySelector(eyeId).addEventListener("click", () => {
        const inp = list.querySelector(inputId);
        inp.type  = inp.type === "password" ? "text" : "password";
      });
    }

    function showError(msg) {
      const e = list.querySelector("#userError");
      e.textContent = msg;
      e.classList.remove("hidden");
    }

    function clearError() {
      list.querySelector("#userError")?.classList.add("hidden");
    }

    function setLoading(btn, loading, label) {
      btn.disabled    = loading;
      btn.textContent = loading ? "…" : label;
    }

    function done(name) {
      setUser(name);
      overlay.classList.add("hidden");
      resolve(name);
    }

    function renderLogin() {
      list.innerHTML = `
        <input id="userInput" class="user-input" type="text"
               placeholder="Username" autocomplete="off" spellcheck="false" />
        <div class="pw-field">
          <input id="userPw" class="user-input" type="password"
                 placeholder="Password" autocomplete="current-password" />
          <button id="userPwEye" class="pw-eye" type="button" aria-label="Show password">👁</button>
        </div>
        <button id="userSubmit" class="user-btn">Sign in</button>
        <p id="userError" class="user-error hidden"></p>
        <button id="toCreate" class="user-link" type="button">Create account</button>
      `;
      wireEye("#userPwEye", "#userPw");
      list.querySelector("#toCreate").addEventListener("click", renderCreate);
      list.querySelector("#userPw").addEventListener("keydown", e => { if (e.key === "Enter") attemptLogin(); });
      list.querySelector("#userInput").addEventListener("input", clearError);
      list.querySelector("#userPw").addEventListener("input", clearError);
      list.querySelector("#userSubmit").addEventListener("click", attemptLogin);
      setTimeout(() => list.querySelector("#userInput").focus(), 100);
    }

    function renderCreate() {
      list.innerHTML = `
        <input id="userInput" class="user-input" type="text"
               placeholder="Username" autocomplete="off" spellcheck="false" />
        <div class="pw-field">
          <input id="userPw" class="user-input" type="password"
                 placeholder="Password" autocomplete="new-password" />
          <button id="userPwEye" class="pw-eye" type="button" aria-label="Show password">👁</button>
        </div>
        <div class="pw-field" style="margin-top:10px">
          <input id="userPwConfirm" class="user-input" type="password"
                 placeholder="Confirm password" autocomplete="new-password" />
          <button id="userPwConfirmEye" class="pw-eye" type="button" aria-label="Show password">👁</button>
        </div>
        <button id="userSubmit" class="user-btn">Create account</button>
        <p id="userError" class="user-error hidden"></p>
        <button id="toLogin" class="user-link" type="button">Back to sign in</button>
      `;
      wireEye("#userPwEye", "#userPw");
      wireEye("#userPwConfirmEye", "#userPwConfirm");
      list.querySelector("#toLogin").addEventListener("click", renderLogin);
      list.querySelectorAll("input").forEach(inp => inp.addEventListener("input", clearError));
      list.querySelector("#userPwConfirm").addEventListener("keydown", e => { if (e.key === "Enter") attemptCreate(); });
      list.querySelector("#userSubmit").addEventListener("click", attemptCreate);
      setTimeout(() => list.querySelector("#userInput").focus(), 100);
    }

    async function attemptLogin() {
      const name     = list.querySelector("#userInput").value.trim();
      const password = list.querySelector("#userPw").value;
      if (!name || !password) { showError("Enter username and password."); return; }
      const btn = list.querySelector("#userSubmit");
      setLoading(btn, true, "Sign in");
      try {
        const res = await post({ action: "login", name, password });
        if (res.ok) {
          done(name);
        } else if (res.status === 401) {
          showError("Invalid username or password.");
          list.querySelector("#userPw").value = "";
          list.querySelector("#userPw").focus();
        } else {
          throw new Error();
        }
      } catch { showError("Network error. Try again."); }
      finally  { setLoading(btn, false, "Sign in"); }
    }

    async function attemptCreate() {
      const name     = list.querySelector("#userInput").value.trim();
      const password = list.querySelector("#userPw").value;
      const confirm  = list.querySelector("#userPwConfirm").value;
      if (!name || !password || !confirm) { showError("Fill in all fields."); return; }
      if (password !== confirm) { showError("Passwords don't match."); return; }
      const btn = list.querySelector("#userSubmit");
      setLoading(btn, true, "Create account");
      try {
        const res = await post({ action: "create", name, password });
        if (res.status === 409) { showError("Username already taken."); return; }
        if (!res.ok) throw new Error();
        done(name);
      } catch { showError("Network error. Try again."); }
      finally  { setLoading(btn, false, "Create account"); }
    }

    overlay.classList.remove("hidden");
    renderLogin();
  });
}

export async function initAuth() {
  const saved = getUser();
  if (saved) {
    try {
      const res       = await post({ action: "validate", name: saved });
      const { valid } = await res.json();
      if (valid) {
        document.getElementById("currentUserLabel").textContent = saved;
        return saved;
      }
    } catch {
      // network error — fall through to login
    }
  }
  const chosen = await showPicker();
  document.getElementById("currentUserLabel").textContent = chosen;
  return chosen;
}
