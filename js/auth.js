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
    list.innerHTML = "";
    users.forEach(name => {
      const btn = document.createElement("button");
      btn.className = "user-btn";
      btn.textContent = name;
      btn.addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEY, name);
        overlay.classList.add("hidden");
        resolve(name);
      });
      list.appendChild(btn);
    });
    overlay.classList.remove("hidden");
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
