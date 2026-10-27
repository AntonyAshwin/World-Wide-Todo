# myBoard

Mobile-friendly daily task tracker with points. Data stored in a real DB — **Netlify Blobs** — via a serverless function. Single user, no login.

## Features
- **Today view** — shows only tasks due today.
- **Tap to toggle** — tap a task to mark done; tap again to undo.
- **Recurring or one-time** — daily, weekly (pick weekdays), or one-time (today).
- **Points** — set points per task. Earning is **snapshotted** at completion, so your lifetime total survives editing or deleting the task later.
- **Lifetime total** — ⭐ counter in the header; today's progress bar shows earned / total.
- **Offline cache** — last state cached in the browser; syncs to the DB when back online.

## How data is stored
- One Netlify Blobs entry holds the whole state: `{ tasks, done }`.
- `done` maps `date -> { taskId: pointsAwarded }`. Lifetime points = sum of all awarded values.
- Served by [netlify/functions/data.mjs](netlify/functions/data.mjs) at `/api/state` (GET load, POST save).

## Run locally
Netlify Blobs needs the Netlify dev runtime:
```
npm install
npm i -g netlify-cli
netlify dev
```
Opens http://localhost:8888 with the function + blobs emulated.

> Opening `index.html` directly works for the UI, but `/api/state` only runs under `netlify dev` or on Netlify.

## Deploy to Netlify
**Git (recommended):** push to GitHub → "Add new site" → import. No build command; publish `.`, functions auto-detected. Blobs works with zero config.

**CLI:**
```
netlify deploy --prod
```

## Notes
- Single shared store — anyone with the URL sees the same tasks (no auth, as requested).
- To add logins/multi-user later, scope the blob key per user + add Netlify Identity.
