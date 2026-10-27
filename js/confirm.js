const popup    = document.getElementById("confirmPopup");
const backdrop = document.getElementById("confirmBackdrop");
const text     = document.getElementById("confirmText");
let cb = null;

function hide() {
  popup.classList.add("hidden");
  backdrop.classList.add("hidden");
  cb = null;
}

export function showConfirm(msg, onYes) {
  text.textContent = msg;
  cb = onYes;
  popup.classList.remove("hidden");
  backdrop.classList.remove("hidden");
}

document.getElementById("confirmYes").addEventListener("click", () => { if (cb) cb(); hide(); });
document.getElementById("confirmNo").addEventListener("click", hide);
backdrop.addEventListener("click", hide);
