// Single source of truth. Mutate .tasks / .done directly; never reassign the object.
export const state = { tasks: [], done: {} };

export function updateState(tasks, done) {
  state.tasks = tasks;
  state.done  = done;
}
