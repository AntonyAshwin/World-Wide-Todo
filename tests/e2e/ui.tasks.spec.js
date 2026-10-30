/**
 * UI tests — require a browser (Chromium).
 * First-time setup: npx playwright install chromium
 * Then: npm run test:e2e
 *
 * Dev server must be running: netlify dev on port 3000.
 */

import { test, expect } from '@playwright/test';

// ── helpers ────────────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
}

async function register(request, username, password = 'pass1234') {
  const res = await request.post('/api/auth/register', { data: { username, password } });
  const body = await res.json();
  if (!body.success) throw new Error(`register ${username}: ${body.error}`);
  return body.data; // { token, user: { id, username } }
}

function authedReq(request, token) {
  const h = { Authorization: `Bearer ${token}` };
  return {
    get:  (path)       => request.get(path, { headers: h }),
    post: (path, data) => request.post(path, { data, headers: h }),
    put:  (path, data) => request.put(path, { data, headers: h }),
  };
}

// Sets the auth token in localStorage so the app shell loads without logging in.
async function loginPage(page, token, user) {
  await page.addInitScript(({ token, user, tokenKey, userKey }) => {
    localStorage.setItem(tokenKey, token);
    localStorage.setItem(userKey, JSON.stringify(user));
  }, { token, user, tokenKey: 'tb_token', userKey: 'tb_user' });
}

// ── Story: Today bar — percentage updates immediately on completion ─────────────

test.describe('Story: Today bar — live percentage update', () => {
  test('percentage label updates immediately when task is completed — no reload needed', async ({ page, request }) => {
    const id = uid();
    const [a, b] = await Promise.all([
      register(request, `alice${id}`),
      register(request, `wer${id}`, 'werwer'),
    ]);
    const u = authedReq(request, a.token);
    const w = authedReq(request, b.token);

    // Set up friendship
    const fr = (await (await u.post('/api/friends', { username: b.user.username })).json()).data.friendship;
    await w.put(`/api/friends/${fr.id}/respond`, { accept: true });

    // Create task and get it approved so it's the only task (20 pts → 100% when done)
    const task = (await (await u.post('/api/tasks', { name: 'Morning run', points: 20, days: [] })).json()).data.task;
    const approval = (await (await u.post(`/api/tasks/${task.id}/request-approval`, { approverId: b.user.id })).json()).data.approval;
    await w.put(`/api/tasks/${approval.id}/approve`, { accept: true });

    // Open the app in browser with A's token pre-set
    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');

    // Wait for today view to load (task item present)
    await page.waitForSelector('.task-item', { timeout: 10_000 });

    // Initial state: 0% (task not completed yet)
    const label = page.locator('#daily-label');
    await expect(label).toHaveText('0% of today');

    const pts = page.locator('#daily-pts');
    await expect(pts).toHaveText('0 pts');

    // Complete the task by clicking it
    await page.locator(`.task-item[data-id="${task.id}"]`).click();

    // Label and points must update WITHOUT any navigation/reload
    await expect(label).toHaveText('100% of today', { timeout: 5_000 });
    await expect(pts).toHaveText('20 pts');

    // Bar fill should also be 100%
    const fill = page.locator('#daily-fill');
    await expect(fill).toHaveCSS('width', /^\d+px$/); // just has a width
    const width = await fill.evaluate(el => el.style.width);
    expect(width).toBe('100%');
  });

  test('percentage label updates when task is uncompleted (toggled off)', async ({ page, request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);
    const u = authedReq(request, a.token);

    // Single unapproved task (25 pts)
    const task = (await (await u.post('/api/tasks', { name: 'Walk', points: 25, days: [] })).json()).data.task;

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('.task-item', { timeout: 10_000 });

    // Complete it
    await page.locator(`.task-item[data-id="${task.id}"]`).click();
    await expect(page.locator('#daily-label')).toHaveText('100% of today', { timeout: 5_000 });

    // Toggle off
    await page.locator(`.task-item[data-id="${task.id}"]`).click();
    await expect(page.locator('#daily-label')).toHaveText('0% of today', { timeout: 5_000 });
    await expect(page.locator('#daily-pts')).toHaveText('0 pts');
  });

  test('partial completion — percentage reflects correct fraction', async ({ page, request }) => {
    const id = uid();
    const [a, b] = await Promise.all([
      register(request, `alice${id}`),
      register(request, `wer${id}`, 'werwer'),
    ]);
    const u = authedReq(request, a.token);
    const w = authedReq(request, b.token);

    const fr = (await (await u.post('/api/friends', { username: b.user.username })).json()).data.friendship;
    await w.put(`/api/friends/${fr.id}/respond`, { accept: true });

    // Two tasks: 10 pts and 10 pts = 20 total. Completing one = 50%.
    const t1 = (await (await u.post('/api/tasks', { name: 'Task 1', points: 10, days: [] })).json()).data.task;
    const t2 = (await (await u.post('/api/tasks', { name: 'Task 2', points: 10, days: [] })).json()).data.task;

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('.task-item', { timeout: 10_000 });

    await expect(page.locator('#daily-label')).toHaveText('0% of today');

    // Complete first task
    await page.locator(`.task-item[data-id="${t1.id}"]`).click();
    await expect(page.locator('#daily-label')).toHaveText('50% of today', { timeout: 5_000 });
    await expect(page.locator('#daily-pts')).toHaveText('10 pts');

    // Complete second task
    await page.locator(`.task-item[data-id="${t2.id}"]`).click();
    await expect(page.locator('#daily-label')).toHaveText('100% of today', { timeout: 5_000 });
    await expect(page.locator('#daily-pts')).toHaveText('20 pts');
  });
});
