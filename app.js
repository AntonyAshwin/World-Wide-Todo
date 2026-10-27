import { loadState } from './js/api.js';
import { render }    from './js/render.js';
import { openSheet, closeSheet, addTask } from './js/sheet.js';

document.getElementById("addBtn").addEventListener("click", openSheet);
document.getElementById("cancelBtn").addEventListener("click", closeSheet);
document.getElementById("saveBtn").addEventListener("click", addTask);
document.getElementById("sheetBackdrop").addEventListener("click", closeSheet);

loadState(render);
