# myBoard — Project Context for Claude

Competitive daily task app for mobile web. Friends challenge each other via a pair scoreboard driven only by **approved** tasks.

## Stack

- **Frontend**: Vanilla JS ES modules, no framework, no build step
- **Backend**: Netlify Functions v2 (ES modules, `config.path` routing)
- **DB**: Netlify Blobs (`@netlify/blobs`) with `consistency: 'strong'`
- **Auth**: Custom HS256 JWT (Node `crypto`), PBKDF2 password hashing, 30-day tokens in `localStorage`
- **Local dev**: `netlify dev` on port 3000 (`netlify.toml` → `[dev] port = 3000 targetPort = 3000`)

**Never open the app on port 8888 — always 3000.**

## File Map

```
/
├── index.html            — SPA shell
├── app.js                — init, auth check, shell build, nav, toast, handleLoginSuccess
├── js/
│   ├── api.js            — fetch wrapper + all API methods
│   ├── router.js         — HTML5 history router, lazy page imports
│   └── state.js          — simple pub/sub state
├── pages/
│   ├── auth.js           — login/register
│   ├── tasks.js          — today view, completion toggle
│   ├── manage.js         — task CRUD + approval request + unlock
│   ├── friends.js        — add/accept/reject friends
│   ├── scoreboard.js     — pair progress bars
│   └── proposals.js      — task approvals, goal proposals, notification feed
└── netlify/functions/
    ├── _utils.mjs        — JWT, password hash, stores, helpers
    ├── auth.mjs          — /api/auth/:action
    ├── friends.mjs       — /api/friends, /api/friends/:id/:action
    ├── tasks.mjs         — /api/tasks (and /:id, /:id/:action)
    ├── goals.mjs         — /api/goals, /api/goals/:id/:action
    ├── scoreboard.mjs    — /api/scoreboard
    └── notifications.mjs — /api/notifications
```

## Blobs Key Schema

| Store | Key | Value |
|-------|-----|-------|
| users | `user:{id}` | `{ id, username, hash, salt, createdAt }` |
| users | `username:{lowercase}` | `{ userId }` |
| friendships | `friendship:{id}` | `{ id, requesterId, receiverId, status, ... }` |
| friendships | `user_friendships:{userId}` | `[friendshipId, ...]` |
| tasks | `task:{id}` | task object (see below) |
| tasks | `user_tasks:{userId}` | `[taskId, ...]` |
| completions | `completion:{userId}:{YYYY-MM-DD}:{taskId}` | `{ taskId, userId, date, points, approvedPoints, completedAt }` |
| completions | `task_completions:{taskId}` | `[{ date, points, approvedPoints }, ...]` |
| points | `daily:{userId}:{YYYY-MM-DD}` | `{ points }` — personal tracker |
| points | `approved_daily:{userId}:{YYYY-MM-DD}` | `{ points }` — pair scoreboard only |
| approvals | `approval:{id}` | approval object |
| approvals | `pending_approvals:{userId}` | `[approvalId, ...]` |
| goals | `goal:{id}` | goal object |
| goals | `active_goal:{friendshipId}` | `{ goalId, targetPoints, period, activatedAt }` |
| goals | `friendship_goals:{friendshipId}` | `[goalId, ...]` |
| notifications | `notifs:{userId}` | `[notif, ...]` capped at 100 |

## Task Object Shape

```js
{
  id, userId, name, points,       // points: 1-1000
  days,                           // int[] 0-6 (Sun=0), empty = today-only one-time task
  approvalStatus,                 // 'none' | 'pending' | 'approved'
  approvedBy,                     // userId of approver | null
  activeApprovalId,               // pending approval id | null
  createdAt, updatedAt
}
```

## Two-Bucket Points Architecture

- `daily:{userId}:{date}` — ALL completions (personal progress bar)
- `approved_daily:{userId}:{date}` — only completions of **approved** tasks (scoreboard)

The scoreboard reads `approved_daily` only. Personal tracker reads `daily` only.

`completion:` records carry BOTH `points` (for `daily:` rollback) and `approvedPoints` (for `approved_daily:` rollback). These differ if a task was re-approved at a new point value or was completed unapproved (`approvedPoints = 0`).

## Approval Flow

1. Owner requests approval → sends to a specific friend → `approvalStatus = 'pending'`
2. Friend approves/rejects on Activity page → `approvalStatus = 'approved'` or `'none'`
3. On approve: `applyApprovedPoints()` retroactively adds points to ALL historical completions in `approved_daily`
4. On unlock (`POST /api/tasks/:id/unapprove`): `removeApprovedPoints()` subtracts and zeros all, sets `approvalStatus = 'none'`
5. On edit of an approved task: same as unlock (auto-unapproves), then user must re-request approval

**Critical**: `removeApprovedPoints` ALWAYS sets `task.approvalStatus = 'none'` — even when `task_completions` is empty (no completions yet). Prior bug: early `return` skipped the state reset → task stayed 'approved' → completing again re-added to pair score.

## Goal / Scoreboard Logic

- Goals are per friendship pair, proposed by either party, accepted by the other
- Most recently accepted proposal = active goal (overrides previous)
- Period options: `1w`, `2w`, `3w`, `1m` (auto-repeating — `currentPeriodStart()` calculates current window)
- Scoreboard sums `approved_daily` for all dates in the current period

## Navigation

Bottom nav tabs → paths:
- `/tasks` → today view
- `/manage` → task CRUD
- `/friends` → friendship management
- `/scoreboard` → pair progress bars
- `/proposals` → approvals + goals + notifications

Router: `renderPage(path)` dynamic-imports the page module and calls `mod.render(el)` — fresh load each navigation.

## API Summary (`js/api.js`)

```js
api.auth.{register, login, me}
api.friends.{list, request, respond}
api.tasks.{list, today, create, update, delete, complete, unapprove,
           requestApproval, approveRespond, pendingApprovals}
api.goals.{list, propose, respond}
api.scoreboard.get
api.notifications.{list, markRead}
```

## Production Notes

- Set `JWT_SECRET` env var in Netlify dashboard (default `dev-secret-change-in-production`)
- Netlify Blobs works automatically in Netlify Functions — no setup needed
- For local dev, `netlify dev` provisions a local Blobs store automatically
