import { getStore } from "@netlify/blobs";

const STORE = "taiynsha-social";
const KEY = "shared-feed-v1.json";
const MAX_BODY = 900_000;
const MAX_POSTS = 800;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanPosts(value) {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_POSTS) return null;
  const output = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").slice(0, 80);
    const title = String(item.title || "").slice(0, 180);
    const text = String(item.text || "").slice(0, 5000);
    if (!id || (!title && !text)) continue;
    const comments = Array.isArray(item.comments) ? item.comments.slice(-150).map((c) => ({
      text: String(c?.text || "").slice(0, 500),
      date: Number(c?.date) || Date.now(),
      authorId: String(c?.authorId || "").slice(0, 80),
      reactions: c?.reactions && typeof c.reactions === "object" ? c.reactions : {},
    })) : [];
    output.push({
      ...item,
      id,
      title,
      text,
      date: Number(item.date) || Date.now(),
      likes: Math.max(0, Math.min(1_000_000, Number(item.likes) || 0)),
      comments,
    });
  }
  return output;
}

export default async (request) => {
  if (request.method !== "GET" && request.method !== "PUT") {
    return json({ error: "Method not allowed" }, 405);
  }

  const store = getStore(STORE);

  if (request.method === "GET") {
    const saved = await store.get(KEY, { type: "json", consistency: "strong" });
    return json({
      posts: Array.isArray(saved?.posts) ? saved.posts : [],
      updatedAt: Number(saved?.updatedAt) || 0,
    });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY) return json({ error: "Payload too large" }, 413);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "Payload too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const posts = cleanPosts(body?.posts);
  if (!posts) return json({ error: "Invalid posts data" }, 400);

  await store.setJSON(KEY, { posts, updatedAt: Date.now() });
  return json({ ok: true, count: posts.length });
};
