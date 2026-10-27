import { getStore } from "@netlify/blobs";
import { createHash } from "crypto";

function hashPw(pw) {
  return createHash("sha256").update(String(pw)).digest("hex");
}

async function getUsers(store) {
  const data = await store.get("users", { type: "json" });
  if (data) {
    if (data.length && typeof data[0] === "string") {
      const migrated = data.map(name => ({ name, passwordHash: hashPw("changeme") }));
      await store.setJSON("users", migrated);
      return migrated;
    }
    return data;
  }
  return [];
}

export default async (req) => {
  const store = getStore("Ashwin's TODO");

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  if (body.action === "create") {
    const { name, password } = body;
    if (!name || !password) return new Response("Invalid", { status: 400 });
    const users = await getUsers(store);
    if (users.some(u => u.name === name))
      return new Response("Username taken", { status: 409 });
    users.push({ name, passwordHash: hashPw(password) });
    await store.setJSON("users", users);
    return Response.json({ ok: true });
  }

  if (body.action === "login") {
    const { name, password } = body;
    if (!name || password == null) return Response.json({ ok: false });
    const users = await getUsers(store);
    const user  = users.find(u => u.name === name);
    if (!user || hashPw(password) !== user.passwordHash)
      return new Response("Invalid credentials", { status: 401 });
    return Response.json({ ok: true });
  }

  if (body.action === "validate") {
    const { name } = body;
    const users = await getUsers(store);
    return Response.json({ valid: users.some(u => u.name === name) });
  }

  if (body.action === "rename") {
    const { from, to } = body;
    if (!from || !to || from === to) return new Response("Invalid", { status: 400 });
    const users = await getUsers(store);
    const user  = users.find(u => u.name === from);
    if (!user) return new Response("User not found", { status: 404 });
    user.name = to;
    await store.setJSON("users", users);
    const oldState = await store.get(`state:${from}`, { type: "json" });
    if (oldState) {
      await store.setJSON(`state:${to}`, oldState);
      await store.delete(`state:${from}`);
    }
    return Response.json({ ok: true });
  }

  if (body.action === "changePassword") {
    const { name, oldPassword, newPassword } = body;
    if (!name || !oldPassword || !newPassword)
      return new Response("Invalid", { status: 400 });
    const users = await getUsers(store);
    const user  = users.find(u => u.name === name);
    if (!user || hashPw(oldPassword) !== user.passwordHash)
      return new Response("Wrong password", { status: 401 });
    user.passwordHash = hashPw(newPassword);
    await store.setJSON("users", users);
    return Response.json({ ok: true });
  }

  return new Response("Unknown action", { status: 400 });
};

export const config = { path: "/api/users" };
