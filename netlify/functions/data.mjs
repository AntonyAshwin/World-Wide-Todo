import { getStore } from "@netlify/blobs";

// Single-user key-value store for myBoard. One blob holds the whole state.
export default async (req) => {
  const store = getStore("myboard");

  if (req.method === "GET") {
    const data = await store.get("state", { type: "json" });
    return Response.json(data || { tasks: [], done: {} });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
    const clean = {
      tasks: Array.isArray(body.tasks) ? body.tasks : [],
      done: body.done && typeof body.done === "object" ? body.done : {},
    };
    await store.setJSON("state", clean);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/state" };
