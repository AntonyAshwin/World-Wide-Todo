const listeners = {};

export const state = {
  user: null,
  unreadCount: 0,
};

export function setState(updates) {
  Object.assign(state, updates);
  Object.keys(updates).forEach(key => {
    (listeners[key] || []).forEach(fn => fn(state[key]));
  });
}

export function on(key, fn) {
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(fn);
  return () => { listeners[key] = listeners[key].filter(f => f !== fn); };
}
