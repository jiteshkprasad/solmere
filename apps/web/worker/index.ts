/**
 * solmere.jitesh.app Worker: serves the static replay (ASSETS) and a small comments API on D1.
 *
 *   GET  /api/comments?target=day-4|moment-12   visible comments, newest first
 *   GET  /api/comments/counts                   { "day-4": 3, ... } for visible comments
 *   GET  /api/comments/config                   { siteKey } for the Turnstile widget
 *   POST /api/comments  {target,name,body,token} add one (Turnstile, rate limit, filters)
 *   POST /api/comments/report {id}              one report per person; 3 reports hide it
 *   GET  /api/mod/recent, POST /api/mod/hide {id,hidden}   need header X-Mod-Key = MOD_KEY
 *
 * No accounts, no emails, no raw IPs stored: only a daily salted hash of the IP, for rate limits and reports.
 * Only /api/* runs this code (run_worker_first); every other path is a static file.
 */

interface D1Result<T> { results: T[] }
interface D1Stmt { bind(...v: unknown[]): D1Stmt; all<T>(): Promise<D1Result<T>>; first<T>(): Promise<T | null>; run(): Promise<unknown> }
interface D1Database { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<unknown> }
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  DB: D1Database;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  MOD_KEY: string;
  IP_SALT: string;
}

const TARGET = /^(day-([1-9]|[12]\d|3[01])|moment-\d{1,3})$/;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|xyz|ru|in|app|co|me|info|biz|ly|gg|tk|top|site|online|shop)\b)/i;
// a short list of slurs and the worst abuse; ordinary swearing is allowed (the town swears too)
const BLOCK = /\b(n[i1]gg(a|er)s?|f[a4]gg?[o0]ts?|k[i1]kes?|ch[i1]nks?|sp[i1]cs?|tr[a4]nn(y|ies)|retards?|c[u\*]nts?|rap(e|ist)\b|kill yourself|kys)\b/i;
const MAX_NAME = 40, MAX_BODY = 500, HIDE_AT_REPORTS = 3;

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

async function ipHash(req: Request, env: Env): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${env.IP_SALT || env.MOD_KEY}|${day}`));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clean(s: unknown, max: number): string {
  // strip control characters, collapse runs of blank lines and spaces
  return String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮]/g, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, max);
}

function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function turnstileOk(token: string, req: Request, env: Env): Promise<boolean> {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = req.headers.get("cf-connecting-ip");
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = (await r.json().catch(() => ({}))) as { success?: boolean };
  return !!out.success;
}

type Row = { id: number; target: string; name: string; body: string; created_at: number; hidden?: number; reports?: number };
const pub = (r: Row) => ({ id: r.id, target: r.target, name: r.name, body: r.body, at: r.created_at });

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const now = Date.now();

  if (path === "/api/comments/config" && req.method === "GET") return json({ siteKey: env.TURNSTILE_SITE_KEY ?? "" });

  if (path === "/api/comments/counts" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT target, COUNT(*) AS n FROM comments WHERE hidden = 0 GROUP BY target").all<{ target: string; n: number }>();
    return json(Object.fromEntries(results.map((r) => [r.target, r.n])), 200, { "cache-control": "public, max-age=15" });
  }

  if (path === "/api/comments" && req.method === "GET") {
    const target = url.searchParams.get("target") ?? "";
    if (!TARGET.test(target)) return json({ error: "bad target" }, 400);
    const { results } = await env.DB.prepare("SELECT id, target, name, body, created_at FROM comments WHERE target = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 200").bind(target).all<Row>();
    return json({ comments: results.map(pub) });
  }

  if (path === "/api/comments" && req.method === "POST") {
    const b = (await req.json().catch(() => null)) as { target?: string; name?: string; body?: string; token?: string } | null;
    if (!b) return json({ error: "Could not read that." }, 400);
    const target = String(b.target ?? ""), name = clean(b.name, MAX_NAME).replace(/\n/g, " "), body = clean(b.body, MAX_BODY);
    if (!TARGET.test(target)) return json({ error: "bad target" }, 400);
    if (name.length < 1) return json({ error: "Add a name (any name)." }, 400);
    if (body.length < 2) return json({ error: "Write a little more." }, 400);
    if (LINK.test(body) || LINK.test(name)) return json({ error: "Links aren't allowed here." }, 400);
    if (BLOCK.test(body) || BLOCK.test(name)) return json({ error: "That language isn't allowed here." }, 400);
    const h = await ipHash(req, env);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?").bind(h, now - 60_000).first<{ n: number }>();
    if ((recent?.n ?? 0) >= 2) return json({ error: "Slow down a little, then try again." }, 429);
    const today = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?").bind(h, now - 86_400_000).first<{ n: number }>();
    if ((today?.n ?? 0) >= 30) return json({ error: "That's the limit for today. Thanks for joining in!" }, 429);
    const hour = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE created_at > ?").bind(now - 3_600_000).first<{ n: number }>();
    if ((hour?.n ?? 0) >= 400) return json({ error: "Comments are busy right now. Try again soon." }, 503);
    if (!(await turnstileOk(String(b.token ?? ""), req, env))) return json({ error: "The spam check didn't pass. Try again." }, 403);
    const row = await env.DB.prepare("INSERT INTO comments (target, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?) RETURNING id, target, name, body, created_at")
      .bind(target, name, body, now, h).first<Row>();
    return json({ comment: row ? pub(row) : null }, 201);
  }

  if (path === "/api/comments/report" && req.method === "POST") {
    const b = (await req.json().catch(() => null)) as { id?: number } | null;
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id < 1) return json({ error: "bad id" }, 400);
    const h = await ipHash(req, env);
    await env.DB.prepare("INSERT OR IGNORE INTO reports (comment_id, ip_hash, created_at) VALUES (?, ?, ?)").bind(id, h, now).run();
    await env.DB.prepare("UPDATE comments SET reports = (SELECT COUNT(*) FROM reports WHERE comment_id = ?), hidden = CASE WHEN (SELECT COUNT(*) FROM reports WHERE comment_id = ?) >= ? THEN 1 ELSE hidden END WHERE id = ?")
      .bind(id, id, HIDE_AT_REPORTS, id).run();
    return json({ ok: true });
  }

  if (path.startsWith("/api/mod/")) {
    if (!sameKey(req.headers.get("x-mod-key") ?? "", env.MOD_KEY ?? "")) return json({ error: "not found" }, 404);
    if (path === "/api/mod/recent" && req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, target, name, body, created_at, hidden, reports FROM comments ORDER BY created_at DESC LIMIT 300").all<Row>();
      return json({ comments: results });
    }
    if (path === "/api/mod/hide" && req.method === "POST") {
      const b = (await req.json().catch(() => null)) as { id?: number; hidden?: boolean } | null;
      const id = Number(b?.id);
      if (!Number.isInteger(id)) return json({ error: "bad id" }, 400);
      await env.DB.prepare("UPDATE comments SET hidden = ? WHERE id = ?").bind(b?.hidden === false ? 0 : 1, id).run();
      return json({ ok: true });
    }
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(req, env, url); }
      catch { return json({ error: "Something went wrong. Try again." }, 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
