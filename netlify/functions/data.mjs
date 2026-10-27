import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url  = new URL(req.url);
  const user = url.searchParams.get("user");
  if (!user) return new Response("Missing user param", { status: 400 });

  const store = getStore("Ashwin's TODO");
  const key   = `state:${user}`;

  if (req.method === "GET") {
    const data = await store.get(key, { type: "json" });
    return Response.json(data || { tasks: [], done: {} });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
    const clean = {
      tasks: Array.isArray(body.tasks) ? body.tasks : [],
      done: body.done && typeof body.done === "object" ? body.done : {},
    };
    await store.setJSON(key, clean);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/state" };
