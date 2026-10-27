const STORAGE_KEY = "Ashwin's TODO.user";

export function getUser() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function switchUser() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

async function fetchUsers() {
  try {
    const res = await fetch("/users.json");
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return [];
  }
}

function showPicker(users) {
  return new Promise(resolve => {
    const overlay = document.getElementById("userPicker");
    const list    = document.getElementById("userList");
    list.innerHTML = `
      <input id="userInput" class="user-input" type="text"
             placeholder="Enter your name" autocomplete="off" spellcheck="false" />
      <button id="userSubmit" class="user-btn">Continue</button>
      <p id="userError" class="user-error hidden">User not found.</p>
    `;

    const input  = list.querySelector("#userInput");
    const submit = list.querySelector("#userSubmit");
    const error  = list.querySelector("#userError");

    const attempt = () => {
      const name = input.value.trim();
      if (users.includes(name)) {
        localStorage.setItem(STORAGE_KEY, name);
        overlay.classList.add("hidden");
        resolve(name);
      } else {
        error.classList.remove("hidden");
        input.select();
      }
    };

    submit.addEventListener("click", attempt);
    input.addEventListener("keydown", e => { if (e.key === "Enter") attempt(); });

    overlay.classList.remove("hidden");
    setTimeout(() => input.focus(), 100);
  });
}

export async function initAuth() {
  const users = await fetchUsers();
  const saved = getUser();
  if (saved && users.includes(saved)) {
    document.getElementById("currentUserLabel").textContent = saved;
    return saved;
  }
  const chosen = await showPicker(users);
  document.getElementById("currentUserLabel").textContent = chosen;
  return chosen;
}
