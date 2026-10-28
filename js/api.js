const BASE = '/api';
let _token = null;

export function setToken(t) { _token = t; }
export function getToken() { return _token; }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data.data;
}

export const api = {
  auth: {
    register: (username, password) => request('POST', '/auth/register', { username, password }),
    login: (username, password) => request('POST', '/auth/login', { username, password }),
    me: () => request('GET', '/auth/me'),
  },
  friends: {
    list: () => request('GET', '/friends'),
    request: (username) => request('POST', '/friends', { username }),
    respond: (id, accept) => request('PUT', `/friends/${id}/respond`, { accept }),
  },
  tasks: {
    list: () => request('GET', '/tasks'),
    today: () => request('GET', '/tasks/today'),
    create: (data) => request('POST', '/tasks', data),
    update: (id, data) => request('PUT', `/tasks/${id}`, data),
    delete: (id) => request('DELETE', `/tasks/${id}`),
    complete: (id) => request('POST', `/tasks/${id}/complete`),
    requestApproval: (id, data) => request('POST', `/tasks/${id}/request-approval`, data),
    approveRespond: (approvalId, accept) => request('PUT', `/tasks/${approvalId}/approve`, { accept }),
    pendingApprovals: () => request('GET', '/tasks/approvals'),
  },
  goals: {
    list: () => request('GET', '/goals'),
    propose: (data) => request('POST', '/goals', data),
    respond: (id, accept) => request('PUT', `/goals/${id}/respond`, { accept }),
  },
  scoreboard: {
    get: () => request('GET', '/scoreboard'),
  },
  notifications: {
    list: () => request('GET', '/notifications'),
    markRead: () => request('PUT', '/notifications'),
  },
};
