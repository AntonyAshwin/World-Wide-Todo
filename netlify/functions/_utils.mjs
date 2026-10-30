import crypto from 'crypto';
import { getStore } from '@netlify/blobs';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function createToken(userId, expiryDays = 30) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + expiryDays * 86400, iat: Math.floor(Date.now() / 1000) }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token) throw new Error('No token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  return crypto.timingSafeEqual(derived, Buffer.from(hash, 'hex'));
}

export const stores = {
  users: () => getStore({ name: 'users', consistency: 'strong' }),
  friendships: () => getStore({ name: 'friendships', consistency: 'strong' }),
  tasks: () => getStore({ name: 'tasks', consistency: 'strong' }),
  completions: () => getStore({ name: 'completions', consistency: 'strong' }),
  points: () => getStore({ name: 'points', consistency: 'strong' }),
  approvals: () => getStore({ name: 'approvals', consistency: 'strong' }),
  goals: () => getStore({ name: 'goals', consistency: 'strong' }),
  notifications: () => getStore({ name: 'notifications', consistency: 'strong' }),
};

export async function requireAuth(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const payload = verifyToken(token);
  const user = await stores.users().get(`user:${payload.userId}`, { type: 'json' });
  if (!user) throw new Error('User not found');
  return { userId: payload.userId, username: user.username };
}

export function ok(data, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
  });
}

export function err(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
  });
}

export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    ...extra,
  };
}

export const uid = () => crypto.randomUUID();
export const today = () => new Date().toISOString().split('T')[0];

export async function addNotification(userId, type, data) {
  const store = stores.notifications();
  const notifId = uid();
  const notif = { id: notifId, type, data, read: false, createdAt: new Date().toISOString() };
  await store.set(`notif:${userId}:${notifId}`, JSON.stringify(notif));
}

export function periodDates(period, startDate) {
  const start = new Date(startDate);
  const end = new Date(startDate);
  const days = { '1w': 7, '2w': 14, '3w': 21, '1m': 30 };
  end.setDate(end.getDate() + days[period] - 1);
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function currentPeriodStart(period, activatedAt) {
  const activated = new Date(activatedAt);
  const now = new Date();
  const days = { '1w': 7, '2w': 14, '3w': 21, '1m': 30 };
  const len = days[period];
  const elapsed = Math.floor((now - activated) / (86400000 * len));
  const start = new Date(activated);
  start.setDate(start.getDate() + elapsed * len);
  return start.toISOString().split('T')[0];
}
