// Single source of truth. Mutate .tasks / .done directly; never reassign the object.
export const state = { tasks: [], done: {}, color: null };

export function updateState(tasks, done, color = null) {
  state.tasks = tasks;
  state.done  = done;
  state.color = color;
}
