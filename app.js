import { initAuth, switchUser } from './js/auth.js';
import { loadState } from './js/api.js';
import { render }    from './js/render.js';
import { openSheet, closeSheet, addTask } from './js/sheet.js';
import './js/nav.js';
import './js/tasks-view.js';

document.getElementById("addBtn").addEventListener("click", openSheet);
document.getElementById("cancelBtn").addEventListener("click", closeSheet);
document.getElementById("saveBtn").addEventListener("click", addTask);
document.getElementById("sheetBackdrop").addEventListener("click", closeSheet);
document.getElementById("switchUserBtn").addEventListener("click", switchUser);

await initAuth();
loadState(render);
