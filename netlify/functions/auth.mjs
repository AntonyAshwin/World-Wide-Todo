import { stores, hashPassword, verifyPassword, createToken, requireAuth, ok, err, uid, corsHeaders } from './_utils.mjs';

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  const action = context.params.action;

  if (req.method === 'POST' && action === 'register') {
    try {
      const { username, password } = await req.json();
      if (!username || !password) return err('Username and password required');
      if (username.length < 3) return err('Username must be 3+ characters');
      if (!/^[a-zA-Z0-9_]+$/.test(username)) return err('Username: letters, numbers, underscores only');
      if (password.length < 6) return err('Password must be 6+ characters');

      const store = stores.users();
      const existing = await store.get(`username:${username.toLowerCase()}`, { type: 'json' });
      if (existing) return err('Username taken');

      const userId = uid();
      const { hash, salt } = hashPassword(password);
      const user = { id: userId, username, passwordHash: hash, salt, createdAt: new Date().toISOString() };

      await Promise.all([
        store.set(`user:${userId}`, JSON.stringify(user)),
        store.set(`username:${username.toLowerCase()}`, JSON.stringify({ userId })),
      ]);

      const token = createToken(userId);
      return ok({ token, user: { id: userId, username } }, 201);
    } catch (e) {
      return err('Registration failed');
    }
  }

  if (req.method === 'POST' && action === 'login') {
    try {
      const { username, password } = await req.json();
      if (!username || !password) return err('Username and password required');

      const store = stores.users();
      const lookup = await store.get(`username:${username.toLowerCase()}`, { type: 'json' });
      if (!lookup) return err('Invalid credentials', 401);

      const user = await store.get(`user:${lookup.userId}`, { type: 'json' });
      if (!user) return err('Invalid credentials', 401);
      if (!verifyPassword(password, user.passwordHash, user.salt)) return err('Invalid credentials', 401);

      const token = createToken(user.id);
      return ok({ token, user: { id: user.id, username: user.username } });
    } catch (e) {
      return err('Login failed');
    }
  }

  if (req.method === 'GET' && action === 'me') {
    try {
      const { userId, username } = await requireAuth(req);
      return ok({ user: { id: userId, username } });
    } catch (e) {
      return err(e.message, 401);
    }
  }

  return err('Not found', 404);
};

export const config = { path: '/api/auth/:action' };
