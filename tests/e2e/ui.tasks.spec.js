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
    await expect(label).toHaveText('0%');

    // daily-pts element no longer exists
    await expect(page.locator('#daily-pts')).toHaveCount(0);

    // Complete the task by clicking it
    await page.locator(`.task-item[data-id="${task.id}"]`).click();

    // Label must update WITHOUT any navigation/reload
    await expect(label).toHaveText('100%', { timeout: 5_000 });

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
    await expect(page.locator('#daily-label')).toHaveText('100%', { timeout: 5_000 });

    // Toggle off
    await page.locator(`.task-item[data-id="${task.id}"]`).click();
    await expect(page.locator('#daily-label')).toHaveText('0%', { timeout: 5_000 });
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

    await expect(page.locator('#daily-label')).toHaveText('0%');

    // Complete first task
    await page.locator(`.task-item[data-id="${t1.id}"]`).click();
    await expect(page.locator('#daily-label')).toHaveText('50%', { timeout: 5_000 });

    // Complete second task
    await page.locator(`.task-item[data-id="${t2.id}"]`).click();
    await expect(page.locator('#daily-label')).toHaveText('100%', { timeout: 5_000 });
  });
});

// ── Story: Lock FAB appears after unlocking without reload ──────────────────────

test.describe('Story: Lock FAB — appears without reload after unlock', () => {
  test('lock FAB appears after unlocking an approved task — no reload needed', async ({ page, request }) => {
    const id = uid();
    const [a, b] = await Promise.all([
      register(request, `alice${id}`),
      register(request, `bob${id}`, 'pass1234'),
    ]);
    const u = authedReq(request, a.token);
    const w = authedReq(request, b.token);

    // Set up friendship
    const fr = (await (await u.post('/api/friends', { username: b.user.username })).json()).data.friendship;
    await w.put(`/api/friends/${fr.id}/respond`, { accept: true });

    // Create task and get it approved (so lock FAB is hidden on load)
    const task = (await (await u.post('/api/tasks', { name: 'Approved Task', points: 10, days: [] })).json()).data.task;
    const approval = (await (await u.post(`/api/tasks/${task.id}/request-approval`, { approverId: b.user.id })).json()).data.approval;
    await w.put(`/api/tasks/${approval.id}/approve`, { accept: true });

    // Open manage page — all tasks are approved, so lock FAB should NOT exist
    await loginPage(page, a.token, a.user);
    await page.goto('/manage');
    await page.waitForSelector('.manage-item', { timeout: 10_000 });

    await expect(page.locator('#approve-fab')).toHaveCount(0);

    // Unlock the task via the unlock icon button
    await page.locator(`[data-unapprove="${task.id}"]`).click();

    // Confirm in the dialog
    await page.locator('#confirm-unapprove').click();

    // Lock FAB must appear WITHOUT any navigation or reload
    await expect(page.locator('#approve-fab')).toBeVisible({ timeout: 5_000 });
  });

  test('lock FAB disappears after all unapproved tasks are sent for approval', async ({ page, request }) => {
    const id = uid();
    const [a, b] = await Promise.all([
      register(request, `carol${id}`),
      register(request, `dan${id}`, 'pass1234'),
    ]);
    const u = authedReq(request, a.token);
    const w = authedReq(request, b.token);

    const fr = (await (await u.post('/api/friends', { username: b.user.username })).json()).data.friendship;
    await w.put(`/api/friends/${fr.id}/respond`, { accept: true });

    // Create a single unapproved task
    await u.post('/api/tasks', { name: 'Unapproved Task', points: 5, days: [] });

    await loginPage(page, a.token, a.user);
    await page.goto('/manage');
    await page.waitForSelector('.manage-item', { timeout: 10_000 });

    // Lock FAB should be visible (unapproved task exists, friend exists)
    await expect(page.locator('#approve-fab')).toBeVisible({ timeout: 5_000 });

    // Select the task and send approval request via the FAB modal
    await page.locator('.manage-item[data-selectable]').click();
    await page.locator('#approve-fab').click();

    // Select approver and send
    await page.locator('#approver-select').selectOption({ label: `dan${id}` });
    await page.locator('#send-approval-btn').click();

    // After all tasks sent for approval, lock FAB must disappear
    await expect(page.locator('#approve-fab')).toHaveCount(0, { timeout: 5_000 });
  });
});

// ── Story: Today page FAB — quick-add task without leaving today view ───────────

test.describe('Story: Today FAB — create task without navigation', () => {
  test('FAB is visible on today page', async ({ page, request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('#tasks-fab', { timeout: 10_000 });

    await expect(page.locator('#tasks-fab')).toBeVisible();
  });

  test('tapping FAB opens add-task modal', async ({ page, request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('#tasks-fab', { timeout: 10_000 });

    await page.locator('#tasks-fab').click();
    await expect(page.locator('#task-name')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('#save-task-btn')).toHaveText('Create Task');
  });

  test('creating task via FAB adds it to today list — no navigation needed', async ({ page, request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('#tasks-fab', { timeout: 10_000 });

    await page.locator('#tasks-fab').click();
    await page.locator('#task-name').fill('Quick run');
    await page.locator('#save-task-btn').click();

    // Task must appear in today list without navigation
    await expect(page.locator('.task-item')).toContainText('Quick run', { timeout: 5_000 });
  });

  test('task created via today FAB defaults to 1 point when points left blank', async ({ page, request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('#tasks-fab', { timeout: 10_000 });

    await page.locator('#tasks-fab').click();
    await page.locator('#task-name').fill('No-points task');
    // leave points blank
    await page.locator('#save-task-btn').click();

    await expect(page.locator('.task-item')).toContainText('No-points task', { timeout: 5_000 });
    // 1pt shown in the points label
    await expect(page.locator('.task-points').first()).toContainText('1pts');
  });

  test('missing name shows inline error, modal stays open', async ({ page, request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('#tasks-fab', { timeout: 10_000 });

    await page.locator('#tasks-fab').click();
    // submit without filling name
    await page.locator('#save-task-btn').click();

    await expect(page.locator('#modal-error')).toHaveText('Task name required');
    await expect(page.locator('#save-task-btn')).toBeVisible(); // modal still open
  });

  test('closing modal via X leaves today page intact', async ({ page, request }) => {
    const id = uid();
    const a = await register(request, `alice${id}`);

    await loginPage(page, a.token, a.user);
    await page.goto('/tasks');
    await page.waitForSelector('#tasks-fab', { timeout: 10_000 });

    await page.locator('#tasks-fab').click();
    await expect(page.locator('#task-name')).toBeVisible();

    await page.locator('#close-modal').click();
    await expect(page.locator('#task-name')).toHaveCount(0); // modal gone
    await expect(page.locator('#tasks-fab')).toBeVisible();  // FAB still there
  });
});
